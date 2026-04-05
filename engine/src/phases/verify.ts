import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync, mkdirSync, rmSync, existsSync, unlinkSync, readdirSync, statSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { tmpdir } from "node:os";
import { generateText } from "ai";

import { config, SOURCE_FILE_TYPES } from "../config.js";
import { getModel } from "../llm.js";
import { dockerExec } from "../sandbox/docker.js";
import type { Proof, Finding } from "../models.js";
import { TESTGEN_SYSTEM_PROMPT, CAPABILITY_EXAMPLES, buildTestGenUserPrompt } from "./test-gen-prompt.js";

const HARNESS_DIR = resolve(import.meta.dirname, "../../../sandbox/harness");
const EXPLOITS_DIR = resolve(import.meta.dirname, "../../../sandbox/exploits");

const MAX_RETRY_ATTEMPTS = 3;

/** vitest.config.js for running generated tests. */
const VITEST_CONFIG = `const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    include: ["generated/**/*.test.js"],
    setupFiles: ["./harness/setup.js"],
    restoreMocks: true,
    testTimeout: 15000,
    pool: "forks",
    reporters: ["json"],
    globals: true,
  },
});
`;

function createSandboxRunner(packageDirName: string): string {
  return `const path = require("path");

const PACKAGES_DIR = path.resolve(__dirname, "..", "test-packages");

/**
 * Load a package entry point and return its module.exports directly.
 * Usage:
 *   const pkg = await runPackage("pkg-name", "index.js");
 *   pkg.init();          // call exported functions
 *   pkg.someMethod();    // interact with the API
 */
async function runPackage(packageName, entryPoint) {
  const packageDir = path.join(PACKAGES_DIR, packageName);
  const entryPath = path.join(packageDir, entryPoint);

  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(packageDir)) {
      delete require.cache[key];
    }
  }

  try {
    return require(entryPath);
  } catch (e) {
    return { __error: e };
  }
}

module.exports = { runPackage };
`;
}

function createChildProcessRunner(): string {
  return `const { fork } = require("child_process");
const path = require("path");

const PACKAGES_DIR = path.resolve(__dirname, "..", "test-packages");

async function runInChildProcess(packageName, entryPoint, options = {}) {
  const { timeout = 3000, maxOutput = 65536 } = options;
  const entryPath = path.join(PACKAGES_DIR, packageName, entryPoint);

  return new Promise((resolve) => {
    const child = fork(entryPath, [], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      silent: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killed = false;

    child.stdout.on("data", (data) => {
      if (stdout.length < maxOutput) {
        stdout += data.toString().slice(0, maxOutput - stdout.length);
      }
    });

    child.stderr.on("data", (data) => {
      if (stderr.length < maxOutput) {
        stderr += data.toString().slice(0, maxOutput - stderr.length);
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      killed = true;
      child.kill("SIGKILL");
    }, timeout);

    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ timedOut, killed, stdout, stderr, exitCode: code });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ timedOut, killed, stdout, stderr: stderr + err.message, exitCode: null });
    });
  });
}

module.exports = { runInChildProcess };
`;
}

interface VitestResult {
  testResults?: Array<{
    name: string;
    status: string;
    assertionResults?: Array<{
      ancestorTitles: string[];
      title: string;
      status: string;
      failureMessages?: string[];
    }>;
  }>;
}

function parseVitestOutput(stdout: string): VitestResult | null {
  const jsonStart = stdout.indexOf("{");
  if (jsonStart === -1) return null;

  try {
    return JSON.parse(stdout.slice(jsonStart)) as VitestResult;
  } catch {
    const lines = stdout.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i]!.trim().startsWith("{")) {
        try {
          return JSON.parse(lines.slice(i).join("\n")) as VitestResult;
        } catch { continue; }
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Test regeneration with error feedback
// ---------------------------------------------------------------------------

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

function isValidJs(code: string): boolean {
  const tmpFile = join(tmpdir(), `npmguard-syntax-check-${Date.now()}.js`);
  try {
    writeFileSync(tmpFile, code, "utf-8");
    execFileSync("node", ["--check", tmpFile], { timeout: 5000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

async function regenerateTestWithError(
  finding: Finding,
  packageName: string,
  packageSource: string,
  previousTestCode: string,
  errorMessage: string,
  attempt: number,
): Promise<string | null> {
  const example = readExampleTest(finding.capability);

  const retryPrompt = `## Finding
- Capability: ${finding.capability}
- Confidence: ${finding.confidence}
- Location: ${finding.fileLine}
- Problem: ${finding.problem}
- Evidence: ${finding.evidence}

## REPRODUCTION STRATEGY (follow this closely!)
${finding.reproductionStrategy || "Load the package and observe side effects."}

## Package Source Code
${packageSource}

## Reference Example Test
${example}

## PREVIOUS TEST (attempt ${attempt}/${MAX_RETRY_ATTEMPTS}) — FAILED
The following test was generated but FAILED when run in the sandbox:

\`\`\`javascript
${previousTestCode}
\`\`\`

## ERROR OUTPUT
${errorMessage}

## WHAT WENT WRONG — FIX IT
Analyze the error above and fix the test. Common issues:
- runPackage() returns module.exports DIRECTLY. If the module exports { init, track, flush }, then \`const pkg = await runPackage(...)\` gives you those functions directly as \`pkg.init()\`, \`pkg.track()\`, etc.
- If the error says "expected null not to be null" or "expected undefined", the malicious behavior was never triggered. You MUST call the package's exported API functions (init, create, setup, etc.) to trigger it.
- If assertions about HTTP captures fail, the package may need API calls (not just require) before it makes network requests.
- Do NOT use vi.useFakeTimers() BEFORE runPackage() if the package sets up real timers — the fake timers won't replace already-scheduled real timers.
- Instead of fake timers, prefer calling the API methods that trigger the behavior directly (e.g., client.flush(), client._beacon()).

The package name for runPackage() is: "${packageName}"
Output ONLY the fixed JavaScript test code.`;

  try {
    console.log(`[verify:retry] regenerating test for ${finding.capability} (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`);

    const result = await generateText({
      model: getModel(config.testGenModel),
      system: TESTGEN_SYSTEM_PROMPT,
      prompt: retryPrompt,
      temperature: 0.3,
      maxTokens: 8192,
    });

    let code = result.text.trim();
    code = code.replace(/^```(?:javascript|js)?\n?/m, "").replace(/\n?```\s*$/m, "");

    if (!isValidJs(code)) {
      console.error(`[verify:retry] regenerated code has invalid syntax, skipping`);
      return null;
    }

    if (!code.includes("runPackage(") && !code.includes("runInChildProcess(")) {
      console.error(`[verify:retry] regenerated code doesn't use runPackage(), skipping`);
      return null;
    }

    // Auto-fix server.listen/close
    if (code.includes("server.listen(") || code.includes("server.close(")) {
      code = code.replace(/^\s*server\.listen\(.*\);?\s*$/gm, "");
      code = code.replace(/^\s*server\.close\(.*\);?\s*$/gm, "");
      code = code.replace(/^\s*(before|after)(All|Each)\(\(\)\s*=>\s*\{\s*\}\);?\s*$/gm, "");
    }

    console.log(`[verify:retry] regenerated ${code.length} bytes`);
    return code;
  } catch (err) {
    console.error(`[verify:retry] LLM call failed: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Read package source (duplicated from test-gen to avoid circular deps)
// ---------------------------------------------------------------------------

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
          } catch { /* skip */ }
        }
      }
    }
  }

  walk(packagePath, "");
  return files.join("\n\n");
}

// ---------------------------------------------------------------------------
// Main verify function with retry loop
// ---------------------------------------------------------------------------

/** Phase 2: Verify proofs by running generated Vitest tests in a Docker sandbox.
 *  Includes retry loop: failed tests are regenerated with error feedback up to 3 times. */
export async function verifyProofs(
  proofs: Proof[],
  packagePath: string,
  findings?: Finding[],
): Promise<Proof[]> {
  const proofsWithTests = proofs.filter((p) => p.testFile);

  if (proofsWithTests.length === 0) {
    console.log("[verify] no proofs with test files, returning unchanged");
    return proofs;
  }

  console.log(`[verify] verifying ${proofsWithTests.length} proofs with tests`);

  // 1. Create temp workspace on host
  const workDir = mkdtempSync(join(tmpdir(), "npmguard-verify-"));
  const harnessDir = join(workDir, "harness");
  const generatedDir = join(workDir, "generated");
  const testPkgDir = join(workDir, "test-packages");
  mkdirSync(harnessDir, { recursive: true });
  mkdirSync(generatedDir, { recursive: true });
  mkdirSync(testPkgDir, { recursive: true });

  const containerName = `npmguard-verify-${randomUUID().slice(0, 12)}`;
  const timeoutMs = config.verifyTimeoutSec * 1000;

  // Read package source once for potential retries
  const packageDirName = basename(packagePath);
  const packageSource = findings ? readPackageSource(packagePath) : "";

  try {
    // Copy harness files
    copyFileSync(join(HARNESS_DIR, "setup.js"), join(harnessDir, "setup.js"));
    copyFileSync(join(HARNESS_DIR, "server.js"), join(harnessDir, "server.js"));

    // Write custom sandbox-runner and child-process-runner
    writeFileSync(join(harnessDir, "sandbox-runner.js"), createSandboxRunner(packageDirName), "utf-8");
    writeFileSync(join(harnessDir, "child-process-runner.js"), createChildProcessRunner(), "utf-8");

    // Write vitest config
    writeFileSync(join(workDir, "vitest.config.js"), VITEST_CONFIG, "utf-8");

    // Copy the package into test-packages/
    execFileSync("cp", ["-r", packagePath, join(testPkgDir, packageDirName)], { timeout: 10_000 });

    // Copy generated test files
    const testFileMap = new Map<string, number>();
    for (let i = 0; i < proofs.length; i++) {
      const proof = proofs[i]!;
      if (!proof.testFile) continue;

      const testFileName = `finding-${i}.test.js`;
      try {
        copyFileSync(proof.testFile, join(generatedDir, testFileName));
        testFileMap.set(testFileName, i);
      } catch (err) {
        console.error(`[verify] failed to copy test file for proof ${i}: ${err}`);
      }
    }

    if (testFileMap.size === 0) {
      console.log("[verify] no test files could be copied, returning unchanged");
      return proofs;
    }

    // 2. Start Docker container
    const verifyImage = "npmguard-verify";
    const hasVerifyImage = (await dockerExec(["image", "inspect", verifyImage], 5000)).exitCode === 0;
    const image = hasVerifyImage ? verifyImage : config.sandboxImage;
    const network = hasVerifyImage ? "none" : "bridge";

    console.log(`[verify] starting container ${containerName} (image=${image})`);
    const startResult = await dockerExec([
      "run", "-d",
      "--name", containerName,
      `--network=${network}`,
      "--cap-drop=ALL",
      `--memory=${config.sandboxMemoryMb}m`,
      `--cpus=${config.sandboxCpus}`,
      "--user", "0:0",
      "--pids-limit", "128",
      "-v", `${workDir}:/workspace`,
      "-w", "/workspace",
      image,
      "sleep", "infinity",
    ], 30_000);

    if (startResult.exitCode !== 0) {
      console.error(`[verify] failed to start container: ${startResult.stderr}`);
      return proofs;
    }
    console.log(`[verify] container started`);

    try {
      // 3. Make vitest + msw available
      if (hasVerifyImage) {
        await dockerExec(
          ["exec", containerName, "ln", "-s", "/opt/verify/node_modules", "/workspace/node_modules"],
          10_000,
        );
      } else {
        console.log("[verify] installing vitest and msw (no pre-built image)...");
        const installResult = await dockerExec(
          ["exec", containerName, "sh", "-c", "cd /workspace && npm init -y > /dev/null 2>&1 && npm install --no-save vitest msw 2>&1 | tail -5"],
          timeoutMs,
        );
        if (installResult.exitCode !== 0) {
          console.error(`[verify] npm install failed (exit=${installResult.exitCode}):`);
          console.error(installResult.stderr.slice(0, 500));
          return proofs.map((proof) =>
            proof.testFile ? { ...proof, kind: "TEST_UNCONFIRMED" as const } : proof,
          );
        }
      }
      console.log("[verify] dependencies ready");

      const npxPath = hasVerifyImage ? "/opt/verify/node_modules/.bin/vitest" : "npx vitest";

      // Track current proof state across retries
      let currentProofs = [...proofs];

      // ── Retry loop ──
      for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        console.log(`\n[verify] ── attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS} ──`);

        // 4. Run vitest
        // Clear previous results
        const resultsPath = join(workDir, "vitest-results.json");
        try { rmSync(resultsPath, { force: true }); } catch { /* ok */ }

        const vitestResult = await dockerExec(
          ["exec", containerName, "sh", "-c",
            `cd /workspace && ${npxPath} run --reporter=json --outputFile.json=/workspace/vitest-results.json 2>&1; echo VITEST_EXIT=$?`],
          timeoutMs,
        );

        console.log(`[verify] vitest exited with code ${vitestResult.exitCode}`);
        if (vitestResult.stdout) {
          console.log(`[verify] vitest stdout (last 800): ${vitestResult.stdout.slice(-800)}`);
        }

        // 5. Read results
        let parsed: VitestResult | null = null;
        try {
          const resultsJson = readFileSync(resultsPath, "utf-8");
          parsed = JSON.parse(resultsJson) as VitestResult;
        } catch {
          parsed = parseVitestOutput(vitestResult.stdout);
        }

        if (!parsed?.testResults) {
          console.log("[verify] could not parse vitest results");
          if (attempt === MAX_RETRY_ATTEMPTS - 1) {
            return currentProofs.map((proof) =>
              proof.testFile && proof.kind !== "TEST_CONFIRMED"
                ? { ...proof, kind: "TEST_UNCONFIRMED" as const }
                : proof,
            );
          }
          continue;
        }

        // 6. Map results back to proofs and collect failures for retry
        const failedTests: Array<{ proofIndex: number; errorMsg: string }> = [];
        let allPassed = true;

        currentProofs = currentProofs.map((proof, i) => {
          if (!proof.testFile) return proof;
          if (proof.kind === "TEST_CONFIRMED") return proof; // already confirmed in prior attempt

          const testFileName = `finding-${i}.test.js`;
          const testResult = parsed!.testResults?.find((r) =>
            r.name.includes(testFileName),
          );

          if (testResult?.status === "passed") {
            console.log(`[verify] finding-${i}: PASSED -> TEST_CONFIRMED`);
            return {
              ...proof,
              kind: "TEST_CONFIRMED" as const,
              reproducible: true,
              confidence: "CONFIRMED" as const,
            };
          }

          // Collect failure message for retry
          const failureMsg = testResult?.assertionResults
            ?.filter((a) => a.status === "failed")
            ?.flatMap((a) => a.failureMessages ?? [])
            ?.join("\n")
            ?.slice(0, 1000) ?? "Test did not pass (no detailed failure message)";

          console.log(`[verify] finding-${i}: ${testResult?.status ?? "NOT_FOUND"} -> FAILED${failureMsg ? ` (${failureMsg.slice(0, 200)})` : ""}`);

          allPassed = false;
          failedTests.push({ proofIndex: i, errorMsg: failureMsg });

          return proof; // keep current state, will retry
        });

        // If all passed or no retries possible, stop
        if (allPassed) {
          console.log(`[verify] all tests passed on attempt ${attempt + 1}`);
          break;
        }

        if (attempt >= MAX_RETRY_ATTEMPTS - 1) {
          console.log(`[verify] max retries reached, marking remaining as TEST_UNCONFIRMED`);
          currentProofs = currentProofs.map((proof) =>
            proof.testFile && proof.kind !== "TEST_CONFIRMED"
              ? { ...proof, kind: "TEST_UNCONFIRMED" as const }
              : proof,
          );
          break;
        }

        // 7. Regenerate failed tests with error feedback
        if (!findings || findings.length === 0) {
          console.log(`[verify] no findings provided for retry, marking as TEST_UNCONFIRMED`);
          currentProofs = currentProofs.map((proof) =>
            proof.testFile && proof.kind !== "TEST_CONFIRMED"
              ? { ...proof, kind: "TEST_UNCONFIRMED" as const }
              : proof,
          );
          break;
        }

        console.log(`[verify] regenerating ${failedTests.length} failed tests with error feedback...`);

        for (const { proofIndex, errorMsg } of failedTests) {
          const proof = currentProofs[proofIndex]!;
          const finding = findings[proofIndex];
          if (!finding || !proof.testCode) continue;

          const newCode = await regenerateTestWithError(
            finding,
            packageDirName,
            packageSource,
            proof.testCode,
            errorMsg,
            attempt + 1,
          );

          if (newCode) {
            // Write new test file to workspace
            const testFileName = `finding-${proofIndex}.test.js`;
            writeFileSync(join(generatedDir, testFileName), newCode, "utf-8");

            // Update proof with new test code
            const hash = createHash("sha256").update(newCode).digest("hex");
            currentProofs[proofIndex] = {
              ...proof,
              testCode: newCode,
              testHash: hash,
            };
            console.log(`[verify:retry] updated ${testFileName} (${newCode.length} bytes, hash=${hash.slice(0, 12)})`);
          }
        }
      }

      return currentProofs;
    } finally {
      await dockerExec(["rm", "-f", containerName], 10_000).catch(() => {});
      console.log("[verify] container stopped");
    }
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch { /* best effort */ }
  }
}
