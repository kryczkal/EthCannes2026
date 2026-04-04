import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
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
    // Fallback to env-exfil if the specific example doesn't exist
    const fallback = join(EXPLOITS_DIR, "env-exfil.test.js");
    return existsSync(fallback) ? readFileSync(fallback, "utf-8") : "";
  }
}

function readPackageSource(packagePath: string): string {
  const { readdirSync, statSync } = await_free_fs();
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

/** Sync fs helpers that don't conflict with mocked fs in tests */
function await_free_fs() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("node:fs");
  return { readdirSync: fs.readdirSync, statSync: fs.statSync };
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
      maxTokens: 4096,
    });

    let code = result.text.trim();
    // Strip markdown fences if present
    code = code.replace(/^```(?:javascript|js)?\n?/m, "").replace(/\n?```\s*$/m, "");
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

  console.log(`[test-gen] generating tests for ${investigation.findings.length} findings`);

  // Generate test for each finding
  const testResults = await Promise.all(
    investigation.findings.map(async (finding, i) => {
      console.log(`[test-gen] generating test for finding ${i}: ${finding.capability} @ ${finding.fileLine}`);
      const testCode = await generateTestDirect(finding, packageName, packageSource);
      return { index: i, finding, testCode };
    }),
  );

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
