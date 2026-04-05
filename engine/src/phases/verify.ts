import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { config } from "../config.js";
import { dockerExec } from "../sandbox/docker.js";
import type { Proof } from "../models.js";

const HARNESS_DIR = resolve(import.meta.dirname, "../../../sandbox/harness");

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
  const testPkgDir = join(workDir, "test-packages");
  mkdirSync(harnessDir, { recursive: true });
  mkdirSync(generatedDir, { recursive: true });
  mkdirSync(testPkgDir, { recursive: true });

  const containerName = `npmguard-verify-${randomUUID().slice(0, 12)}`;
  const timeoutMs = config.verifyTimeoutSec * 1000;

  try {
    // Copy harness files
    copyFileSync(join(HARNESS_DIR, "setup.js"), join(harnessDir, "setup.js"));
    copyFileSync(join(HARNESS_DIR, "server.js"), join(harnessDir, "server.js"));

    // Write custom sandbox-runner and child-process-runner
    const packageDirName = basename(packagePath);
    writeFileSync(join(harnessDir, "sandbox-runner.js"), createSandboxRunner(packageDirName), "utf-8");
    writeFileSync(join(harnessDir, "child-process-runner.js"), createChildProcessRunner(), "utf-8");

    // Write vitest config
    writeFileSync(join(workDir, "vitest.config.js"), VITEST_CONFIG, "utf-8");

    // Copy the package into test-packages/ so sandbox-runner can find it
    // (copy instead of symlink for Docker bind mount compatibility)
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

    // 2. Start Docker container with workspace bind-mounted (writable)
    //    Key differences from investigation sandbox:
    //    - NOT read-only (need writable workspace for npm install)
    //    - tmpfs without noexec (need to run vitest binaries)
    //    - More memory for node_modules
    //    - network=none still (MSW intercepts in-process)
    // Use npmguard-verify image (vitest+msw pre-installed), fall back to base image.
    // Network=bridge needed only if falling back to npm install.
    const verifyImage = "npmguard-verify";
    const hasVerifyImage = (await dockerExec(["image", "inspect", verifyImage], 5000)).exitCode === 0;
    const image = hasVerifyImage ? verifyImage : config.sandboxImage;
    const network = hasVerifyImage ? "none" : "bridge"; // pre-built image doesn't need network

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
      // 3. Make vitest + msw available in the workspace
      if (hasVerifyImage) {
        // Symlink so Vite's resolver finds deps relative to /workspace
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

      // 4. Run vitest — write JSON results to a file, then read it back
      //    NODE_PATH=/opt/verify/node_modules is baked into the image env;
      //    for fallback (no image), node_modules are in /workspace.
      const npxPath = hasVerifyImage ? "/opt/verify/node_modules/.bin/vitest" : "npx vitest";
      console.log("[verify] running vitest...");
      const vitestResult = await dockerExec(
        ["exec", containerName, "sh", "-c",
          `cd /workspace && ${npxPath} run --reporter=json --outputFile.json=/workspace/vitest-results.json 2>&1; echo VITEST_EXIT=$?`],
        timeoutMs,
      );

      console.log(`[verify] vitest exited with code ${vitestResult.exitCode}`);
      // Log vitest output for debugging
      if (vitestResult.stdout) {
        console.log(`[verify] vitest stdout: ${vitestResult.stdout.slice(0, 800)}`);
      }

      // 5. Read results from the output file (host-mounted workspace)
      let parsed: VitestResult | null = null;
      const resultsPath = join(workDir, "vitest-results.json");
      try {
        const resultsJson = readFileSync(resultsPath, "utf-8");
        parsed = JSON.parse(resultsJson) as VitestResult;
      } catch {
        // Fallback: try parsing from stdout
        parsed = parseVitestOutput(vitestResult.stdout);
      }

      if (!parsed?.testResults) {
        console.log("[verify] could not parse vitest results, marking all as TEST_UNCONFIRMED");
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
          ?.slice(0, 500);

        console.log(`[verify] finding-${i}: ${testResult?.status ?? "NOT_FOUND"} -> TEST_UNCONFIRMED${failureMsg ? ` (${failureMsg})` : ""}`);

        return { ...proof, kind: "TEST_UNCONFIRMED" as const };
      });
    } finally {
      // Stop and remove container
      await dockerExec(["rm", "-f", containerName], 10_000).catch(() => {});
      console.log("[verify] container stopped");
    }
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch { /* best effort */ }
  }
}
