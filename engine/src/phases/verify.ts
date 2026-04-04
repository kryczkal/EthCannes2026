import { mkdtempSync, writeFileSync, readFileSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

import { config } from "../config.js";
import { DockerSandboxController } from "../sandbox/controller.js";
import type { Proof } from "../models.js";

const HARNESS_DIR = resolve(import.meta.dirname, "../../../sandbox/harness");

/** vitest.config.js for running generated tests inside the Docker sandbox. */
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

/**
 * Create a modified sandbox-runner.js that points PACKAGES_DIR at the
 * package mounted inside the Docker container at /pkg.
 */
function createSandboxRunner(packageDirName: string): string {
  return `const path = require("path");

const PACKAGES_DIR = "/test-packages";

async function runPackage(packageName, entryPoint) {
  const packageDir = path.join(PACKAGES_DIR, packageName);
  const entryPath = path.join(packageDir, entryPoint);

  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(packageDir)) {
      delete require.cache[key];
    }
  }

  let exports;
  try {
    exports = require(entryPath);
  } catch (e) {
    exports = { __error: e };
  }

  return { exports };
}

module.exports = { runPackage };
`;
}

/**
 * Modified child-process-runner that works inside the Docker container.
 */
function createChildProcessRunner(): string {
  return `const { fork } = require("child_process");
const path = require("path");

const PACKAGES_DIR = "/test-packages";

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
  // vitest --reporter=json outputs JSON to stdout
  // It may have non-JSON preamble, so find the JSON object
  const jsonStart = stdout.indexOf("{");
  if (jsonStart === -1) return null;

  try {
    return JSON.parse(stdout.slice(jsonStart)) as VitestResult;
  } catch {
    // Try to find JSON in the output more aggressively
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

/** Phase 2: Verify proofs by running generated Vitest tests in a Docker sandbox. */
export async function verifyProofs(
  proofs: Proof[],
  packagePath: string,
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
  mkdirSync(harnessDir, { recursive: true });
  mkdirSync(generatedDir, { recursive: true });

  try {
    // Copy harness files
    copyFileSync(join(HARNESS_DIR, "setup.js"), join(harnessDir, "setup.js"));
    copyFileSync(join(HARNESS_DIR, "server.js"), join(harnessDir, "server.js"));

    // Write custom sandbox-runner and child-process-runner for the container
    const packageDirName = basename(packagePath);
    writeFileSync(join(harnessDir, "sandbox-runner.js"), createSandboxRunner(packageDirName), "utf-8");
    writeFileSync(join(harnessDir, "child-process-runner.js"), createChildProcessRunner(), "utf-8");

    // Write vitest config
    writeFileSync(join(workDir, "vitest.config.js"), VITEST_CONFIG, "utf-8");

    // Copy generated test files
    const testFileMap = new Map<string, number>(); // test filename -> proof index
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

    // 2. Start Docker sandbox
    const sandbox = new DockerSandboxController(
      config.sandboxImage,
      `${config.sandboxMemoryMb}m`,
      config.sandboxCpus,
      config.sandboxNetwork,
    );

    // We need a custom start that mounts both the package AND the workspace
    // The existing controller only mounts packagePath at /pkg.
    // We'll use the existing start() which mounts package at /pkg,
    // then copy workspace files into the container.
    await sandbox.start(packagePath);

    try {
      // Create test-packages dir structure so runPackage can find the package
      await sandbox.exec(["sh", "-c", `mkdir -p /tmp/test-packages && cp -r /pkg /tmp/test-packages/${packageDirName}`], 30);

      // Create workspace inside container's /tmp
      await sandbox.exec(["mkdir", "-p", "/tmp/workspace/harness", "/tmp/workspace/generated"], 10);

      // Copy workspace files into container via docker exec + sh -c cat
      const filesToCopy = [
        { src: join(workDir, "vitest.config.js"), dst: "/tmp/workspace/vitest.config.js" },
        { src: join(harnessDir, "setup.js"), dst: "/tmp/workspace/harness/setup.js" },
        { src: join(harnessDir, "server.js"), dst: "/tmp/workspace/harness/server.js" },
        { src: join(harnessDir, "sandbox-runner.js"), dst: "/tmp/workspace/harness/sandbox-runner.js" },
        { src: join(harnessDir, "child-process-runner.js"), dst: "/tmp/workspace/harness/child-process-runner.js" },
      ];

      for (const { src, dst } of filesToCopy) {
        const content = readFileSync(src, "utf-8");
        await sandbox.exec(["sh", "-c", `cat > ${dst} << 'NPMGUARD_EOF'\n${content}\nNPMGUARD_EOF`], 10);
      }

      // Copy generated test files
      for (const [testFileName] of testFileMap) {
        const content = readFileSync(join(generatedDir, testFileName), "utf-8");
        await sandbox.exec(
          ["sh", "-c", `cat > /tmp/workspace/generated/${testFileName} << 'NPMGUARD_EOF'\n${content}\nNPMGUARD_EOF`],
          10,
        );
      }

      // Fix PACKAGES_DIR in sandbox-runner to point to the copied package
      await sandbox.exec(
        ["sh", "-c", `sed -i 's|/test-packages|/tmp/test-packages|g' /tmp/workspace/harness/sandbox-runner.js /tmp/workspace/harness/child-process-runner.js`],
        10,
      );

      // 3. Install vitest + msw in the container
      console.log("[verify] installing vitest and msw in sandbox...");
      const installResult = await sandbox.exec(
        ["sh", "-c", "cd /tmp/workspace && npm init -y > /dev/null 2>&1 && npm install --no-save vitest msw 2>&1 | tail -5"],
        config.verifyTimeoutSec,
      );
      if (installResult.exitCode !== 0) {
        console.error(`[verify] npm install failed: ${installResult.stderr}`);
        return proofs;
      }
      console.log("[verify] dependencies installed");

      // 4. Run vitest
      console.log("[verify] running vitest...");
      const vitestResult = await sandbox.exec(
        ["sh", "-c", "cd /tmp/workspace && npx vitest run --reporter=json 2>/dev/null || true"],
        config.verifyTimeoutSec,
      );

      console.log(`[verify] vitest exited with code ${vitestResult.exitCode}`);

      // 5. Parse results
      const parsed = parseVitestOutput(vitestResult.stdout);

      if (!parsed?.testResults) {
        console.log("[verify] could not parse vitest output, marking all as TEST_UNCONFIRMED");
        console.log(`[verify] stdout preview: ${vitestResult.stdout.slice(0, 500)}`);
        return proofs.map((proof) =>
          proof.testFile ? { ...proof, kind: "TEST_UNCONFIRMED" as const } : proof,
        );
      }

      // 6. Map results back to proofs
      return proofs.map((proof, i) => {
        if (!proof.testFile) return proof;

        const testFileName = `finding-${i}.test.js`;
        const testResult = parsed.testResults?.find((r) =>
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

        const failureMsg = testResult?.assertionResults
          ?.filter((a) => a.status === "failed")
          ?.flatMap((a) => a.failureMessages ?? [])
          ?.join("\n")
          ?.slice(0, 200);

        console.log(`[verify] finding-${i}: ${testResult?.status ?? "NOT_FOUND"} -> TEST_UNCONFIRMED${failureMsg ? ` (${failureMsg})` : ""}`);

        return { ...proof, kind: "TEST_UNCONFIRMED" as const };
      });
    } finally {
      await sandbox.stop();
    }
  } finally {
    // Cleanup host workspace
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch { /* best effort */ }
  }
}
