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
const SANDBOX_DIR = resolve(import.meta.dirname, "../../../sandbox");

const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readExampleTest(capability: string): string {
  const exampleName = CAPABILITY_EXAMPLES[capability] ?? "env-exfil";
  // Try .ts first, fall back to .js
  for (const ext of [".test.ts", ".test.js"]) {
    const p = join(EXPLOITS_DIR, `${exampleName}${ext}`);
    if (existsSync(p)) return readFileSync(p, "utf-8");
  }
  const fallback = join(EXPLOITS_DIR, "env-exfil.test.js");
  return existsSync(fallback) ? readFileSync(fallback, "utf-8") : "";
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Vitest validation — run the generated test on the host to catch runtime errors
// ---------------------------------------------------------------------------

interface ValidationResult {
  valid: boolean;
  errorType: "runtime" | "assertion" | "timeout" | null;
  errorMessage: string | null;
}

const RUNTIME_ERROR_PATTERNS = [
  "TypeError",
  "ReferenceError",
  "is not a function",
  "is not defined",
  "Cannot find module",
  "Cannot read propert",
  "is not a constructor",
  "SyntaxError",
];

function classifyFailureMessages(messages: string[]): "runtime" | "assertion" {
  const joined = messages.join("\n");
  for (const pattern of RUNTIME_ERROR_PATTERNS) {
    if (joined.includes(pattern)) return "runtime";
  }
  return "assertion";
}

function validateTestWithVitest(testCode: string): ValidationResult {
  const tmpName = `_validation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.test.ts`;
  const tmpPath = join(EXPLOITS_DIR, tmpName);

  try {
    writeFileSync(tmpPath, testCode, "utf-8");

    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    try {
      stdout = execFileSync(
        "npx",
        ["vitest", "run", tmpPath, "--reporter=json", "--config", join(SANDBOX_DIR, "vitest.config.js")],
        { cwd: SANDBOX_DIR, timeout: 25_000, encoding: "utf-8", stdio: "pipe" },
      );
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; status?: number; killed?: boolean };
      stdout = e.stdout ?? "";
      stderr = e.stderr ?? "";
      exitCode = e.status ?? 1;

      if (e.killed) {
        return { valid: false, errorType: "timeout", errorMessage: "Test execution timed out (25s)" };
      }
    }

    // Parse vitest JSON output
    const jsonStart = stdout.lastIndexOf('{"numTotalTestSuites"');
    if (jsonStart === -1) {
      // Could not parse — check stderr for compilation errors
      const combined = stdout + stderr;
      const isRuntime = RUNTIME_ERROR_PATTERNS.some((p) => combined.includes(p));
      if (isRuntime) {
        const errorLine = combined.split("\n").find((l) => RUNTIME_ERROR_PATTERNS.some((p) => l.includes(p))) ?? combined.slice(0, 300);
        return { valid: false, errorType: "runtime", errorMessage: errorLine.slice(0, 500) };
      }
      return { valid: false, errorType: "runtime", errorMessage: `Could not parse vitest output. stderr: ${stderr.slice(0, 300)}` };
    }

    let parsed: {
      numPassedTests: number;
      numFailedTests: number;
      testResults?: Array<{
        assertionResults?: Array<{
          status: string;
          failureMessages?: string[];
        }>;
      }>;
    };

    try {
      parsed = JSON.parse(stdout.slice(jsonStart));
    } catch {
      return { valid: false, errorType: "runtime", errorMessage: "Failed to parse vitest JSON" };
    }

    // All tests passed
    if (parsed.numFailedTests === 0 && parsed.numPassedTests > 0) {
      return { valid: true, errorType: null, errorMessage: null };
    }

    // Some tests failed — classify the failures
    const allFailureMessages = parsed.testResults
      ?.flatMap((r) => r.assertionResults ?? [])
      ?.filter((a) => a.status === "failed")
      ?.flatMap((a) => a.failureMessages ?? []) ?? [];

    const errorType = classifyFailureMessages(allFailureMessages);
    const errorMessage = allFailureMessages.join("\n").slice(0, 500);

    if (errorType === "assertion") {
      // Assertion failure = structurally correct test, keep it
      return { valid: true, errorType: "assertion", errorMessage };
    }

    return { valid: false, errorType: "runtime", errorMessage };
  } finally {
    try { unlinkSync(tmpPath); } catch { /* best effort */ }
  }
}

// ---------------------------------------------------------------------------
// Test generation with retry loop
// ---------------------------------------------------------------------------

function cleanGeneratedCode(raw: string): string {
  let code = raw.trim();
  // Strip markdown fences
  code = code.replace(/^```(?:javascript|js|typescript|ts)?\n?/m, "").replace(/\n?```\s*$/m, "");
  // Strip server.listen/close (harness handles this)
  code = code.replace(/^\s*server\.listen\(.*\);?\s*$/gm, "");
  code = code.replace(/^\s*server\.close\(.*\);?\s*$/gm, "");
  code = code.replace(/^\s*(before|after)(All|Each)\(\(\)\s*=>\s*\{\s*\}\);?\s*$/gm, "");
  return code;
}

async function generateTestDirect(
  finding: Finding,
  packageName: string,
  packageSource: string,
): Promise<string | null> {
  const example = readExampleTest(finding.capability);
  let lastError: string | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Build prompt — on retry, append the error from the previous attempt
    let userPrompt = buildTestGenUserPrompt(finding, packageName, packageSource, example);
    if (lastError && attempt > 0) {
      userPrompt += `\n\n## Previous Attempt Failed (attempt ${attempt}/${MAX_RETRIES})\nYour generated test had a runtime error:\n\`\`\`\n${lastError}\n\`\`\`\nFix the error and regenerate. Common fixes:\n- If "X is not a function": check the module's actual exports in the source code above\n- If "Cannot find module": check the entry point path\n- runPackage() returns module.exports directly — destructure what you need from it`;
    }

    try {
      const result = await generateText({
        model: getModel(config.testGenModel),
        system: TESTGEN_SYSTEM_PROMPT,
        prompt: userPrompt,
        temperature: 0.2 + (attempt * 0.1), // nudge creativity on retries
        maxTokens: 8192,
      });

      const code = cleanGeneratedCode(result.text);

      console.log(`[test-gen] attempt ${attempt + 1}/${MAX_RETRIES}: LLM returned ${code.length} bytes for ${finding.fileLine}`);

      // Structural check (fast)
      if (!code.includes("runPackage(") && !code.includes("runInChildProcess(")) {
        console.error(`[test-gen] attempt ${attempt + 1}: no runPackage/runInChildProcess call, retrying`);
        lastError = "Test must use runPackage() or runInChildProcess() to load the package. Do not use require() directly.";
        continue;
      }

      // For test fixtures, validate on the host; for real packages skip
      // (the Docker verify phase with retry handles real packages)
      const isTestFixture = packageName.startsWith("test-pkg-");
      if (isTestFixture) {
        console.log(`[test-gen] attempt ${attempt + 1}: validating with vitest (test fixture)...`);
        const validation = validateTestWithVitest(code);

        if (validation.valid) {
          if (validation.errorType === "assertion") {
            console.log(`[test-gen] attempt ${attempt + 1}: VALID (assertion failure — structurally correct, keeping)`);
          } else {
            console.log(`[test-gen] attempt ${attempt + 1}: VALID (tests passed)`);
          }
          return code;
        }

        lastError = validation.errorMessage?.slice(0, 500) ?? "Unknown runtime error";
        console.log(`[test-gen] attempt ${attempt + 1}: ${validation.errorType} error, retrying — ${lastError.slice(0, 200)}`);

        if (attempt < MAX_RETRIES - 1) {
          await sleep(1000);
        }
      } else {
        // Real npm package — accept the test, Docker verify will validate it
        console.log(`[test-gen] attempt ${attempt + 1}: ACCEPTED (real package, Docker verify will validate)`);
        return code;
      }
    } catch (err) {
      console.error(`[test-gen] attempt ${attempt + 1}: LLM call failed for ${finding.fileLine}: ${err}`);
      lastError = `LLM call failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  console.error(`[test-gen] all ${MAX_RETRIES} attempts failed for ${finding.fileLine}`);
  return null;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

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
    sleep(j * 2000).then(async () => {
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

    const testPath = join(testDir, `finding-${i}.test.ts`);
    writeFileSync(testPath, result.testCode, "utf-8");
    const hash = createHash("sha256").update(result.testCode).digest("hex");

    console.log(`[test-gen] wrote ${testPath} (${result.testCode.length} bytes, hash=${hash.slice(0, 12)})`);

    return {
      ...proof,
      testFile: testPath,
      testHash: hash,
      testCode: result.testCode,
    };
  });

  const withTests = updatedProofs.filter((p) => p.testFile).length;
  console.log(`[test-gen] generated ${withTests}/${investigation.findings.length} test files`);

  return updatedProofs;
}
