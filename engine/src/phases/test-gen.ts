import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, rmSync, unlinkSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { tmpdir } from "node:os";
import { generateText } from "ai";

import { config, SOURCE_FILE_TYPES } from "../config.js";
import { getModel } from "../llm.js";
import type { Proof, Finding } from "../models.js";
import type { InvestigationResult } from "./investigate.js";
import {
  TESTGEN_SYSTEM_PROMPT,
  CAPABILITY_EXAMPLES,
  buildTestGenUserPrompt,
} from "./test-gen-prompt.js";

const EXPLOITS_DIR = resolve(import.meta.dirname, "../../../sandbox/exploits");

function readExampleTest(capability: string): string {
  const exampleName = CAPABILITY_EXAMPLES[capability] ?? "env-exfil";
  const examplePath = join(EXPLOITS_DIR, `${exampleName}.test.js`);
  try {
    return readFileSync(examplePath, "utf-8");
  } catch {
    const fallback = join(EXPLOITS_DIR, "env-exfil.test.js");
    return existsSync(fallback) ? readFileSync(fallback, "utf-8") : "";
  }
}

function readPackageSource(packagePath: string): string {
  const files: string[] = [];

  function walk(dir: string, prefix: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else {
        const ext = entry.name.split(".").pop() ?? "";
        if (SOURCE_FILE_TYPES.has(ext) || entry.name === "package.json") {
          try {
            const stat = statSync(full);
            if (stat.size < 50_000) {
              files.push(`--- ${rel} ---\n${readFileSync(full, "utf-8")}`);
            }
          } catch { /* skip unreadable */ }
        }
      }
    }
  }

  walk(packagePath, "");
  return files.join("\n\n");
}

function isValidJs(code: string): boolean {
  const tmpFile = join(tmpdir(), `npmguard-syntax-check-${Date.now()}.js`);
  try {
    writeFileSync(tmpFile, code, "utf-8");
    execFileSync("node", ["--check", tmpFile], { timeout: 5000, stdio: "pipe" });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Log the first part of the error for debugging
    console.error(`[test-gen] syntax check failed: ${msg.split("\n").slice(0, 3).join(" | ")}`);
    return false;
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateTestDirect(
  finding: Finding,
  packageName: string,
  packageSource: string,
): Promise<string | null> {
  const example = readExampleTest(finding.capability);
  const userPrompt = buildTestGenUserPrompt(finding, packageName, packageSource, example);

  try {
    const result = await generateText({
      model: getModel(config.testGenModel),
      system: TESTGEN_SYSTEM_PROMPT,
      prompt: userPrompt,
      temperature: 0.2,
      maxTokens: 8192,
    });

    let code = result.text.trim();
    // Strip markdown fences if present
    code = code.replace(/^```(?:javascript|js)?\n?/m, "").replace(/\n?```\s*$/m, "");

    console.log(`[test-gen] LLM returned ${code.length} bytes for ${finding.fileLine}`);

    // Validate JS syntax — reject truncated/invalid output
    if (!isValidJs(code)) {
      console.error(`[test-gen] generated code has invalid syntax for ${finding.fileLine}, skipping (${code.length} bytes)`);
      return null;
    }

    // Reject tests that don't use runPackage() — they'll fail at runtime
    if (!code.includes("runPackage(") && !code.includes("runInChildProcess(")) {
      console.error(`[test-gen] generated code doesn't use runPackage() or runInChildProcess() for ${finding.fileLine}, skipping`);
      return null;
    }

    // Reject tests that call server.listen/close (harness handles this)
    if (code.includes("server.listen(") || code.includes("server.close(")) {
      // Auto-fix: strip those lines rather than rejecting
      code = code.replace(/^\s*server\.listen\(.*\);?\s*$/gm, "");
      code = code.replace(/^\s*server\.close\(.*\);?\s*$/gm, "");
      code = code.replace(/^\s*(before|after)(All|Each)\(\(\)\s*=>\s*\{\s*\}\);?\s*$/gm, "");
      console.log(`[test-gen] auto-fixed: removed server.listen/close calls for ${finding.fileLine}`);
    }

    return code;
  } catch (err) {
    console.error(`[test-gen] LLM call failed for finding ${finding.fileLine}: ${err}`);
    return null;
  }
}

/** Phase 1c: Auto-generate Vitest proof tests from investigation findings. */
export async function generateTests(
  investigation: InvestigationResult,
  packagePath: string,
): Promise<Proof[]> {
  if (investigation.findings.length === 0) {
    console.log("[test-gen] no findings to generate tests for");
    return investigation.proofs;
  }

  const packageName = basename(packagePath);
  const packageSource = readPackageSource(packagePath);
  const testDir = mkdtempSync(join(tmpdir(), "npmguard-tests-"));

  // Limit to top 3 findings to stay within rate limits and time budget.
  // Prefer CONFIRMED findings and deduplicate by capability.
  const seen = new Set<string>();
  const selectedFindings: Array<{ index: number; finding: Finding }> = [];
  for (let i = 0; i < investigation.findings.length && selectedFindings.length < 3; i++) {
    const finding = investigation.findings[i]!;
    const cap = finding.capability;
    if (seen.has(cap)) continue; // skip duplicate capabilities
    seen.add(cap);
    selectedFindings.push({ index: i, finding });
  }

  console.log(`[test-gen] generating tests for ${selectedFindings.length}/${investigation.findings.length} findings (deduplicated by capability)`);

  // Staggered parallel: launch one request per second, run concurrently
  const testResultPromises = selectedFindings.map(({ index: i, finding }, j) =>
    sleep(j * 1000).then(async () => {
      console.log(`[test-gen] generating test ${j + 1}/${selectedFindings.length}: ${finding.capability} @ ${finding.fileLine}`);
      const testCode = await generateTestDirect(finding, packageName, packageSource);
      return { index: i, finding, testCode };
    }),
  );
  const testResults = await Promise.all(testResultPromises);

  // Write test files and update proofs
  const updatedProofs = investigation.proofs.map((proof, i) => {
    const result = testResults.find((r) => r.index === i);
    if (!result?.testCode) return proof;

    const testPath = join(testDir, `finding-${i}.test.js`);
    writeFileSync(testPath, result.testCode, "utf-8");
    const hash = createHash("sha256").update(result.testCode).digest("hex");

    console.log(`[test-gen] wrote ${testPath} (${result.testCode.length} bytes, hash=${hash.slice(0, 12)})`);

    return {
      ...proof,
      testFile: testPath,
      testHash: hash,
    };
  });

  const withTests = updatedProofs.filter((p) => p.testFile).length;
  console.log(`[test-gen] generated ${withTests}/${investigation.findings.length} test files`);

  return updatedProofs;
}
