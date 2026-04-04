import type { Finding } from "../models.js";

export const TESTGEN_SYSTEM_PROMPT = `You are a security test engineer for NpmGuard. Generate a Vitest test that proves a specific malicious behavior in an npm package.

## Test Environment
- Vitest with globals: true (describe, it, expect, vi are globals — do NOT import them)
- MSW for HTTP interception: require("msw") and require("msw/node")
- sandbox-runner.js: runPackage(packageName, entryPoint) loads a package in isolated require context
- server.js: exports { server } — an MSW setupServer() instance
- setup.js: handles server.listen/resetHandlers/close lifecycle (beforeAll/afterEach/afterAll)

## Rules
1. Output ONLY raw JavaScript code (CommonJS). No markdown fences, no explanation.
2. Do NOT import vi, describe, it, expect — they are globals.
3. Use runPackage(packageName, entryPoint) from "../harness/sandbox-runner".
4. Mock/intercept all external I/O (network via MSW, fs via vi.spyOn).
5. Assert on OBSERVABLE BEHAVIOR, not code structure.
6. Clean up in afterEach: vi.unstubAllEnvs(), vi.useRealTimers() if used.
7. Add a short await after runPackage for async operations.
8. For DoS/infinite-loop: use runInChildProcess from "../harness/child-process-runner" with timeout.`;

/** Map capabilities to the most relevant example test patterns. */
export const CAPABILITY_EXAMPLES: Record<string, string> = {
  ENV_VARS: "env-exfil",
  CREDENTIAL_THEFT: "env-exfil",
  NETWORK: "env-exfil",
  DNS_EXFIL: "dns-exfil",
  LIFECYCLE_HOOK: "lifecycle-hook",
  BINARY_DOWNLOAD: "lifecycle-hook",
  PROCESS_SPAWN: "lifecycle-hook",
  OBFUSCATION: "obfuscated-dropper",
  ENCRYPTED_PAYLOAD: "encrypted-payload",
  EVAL: "encrypted-payload",
  DOS_LOOP: "dos-loop",
  FILESYSTEM: "obfuscated-dropper",
  TELEMETRY_RAT: "telemetry-rat",
  BUILD_PLUGIN_EXFIL: "build-plugin-exfil",
  CLIPBOARD_HIJACK: "clipboard-hijack",
  DOM_INJECT: "dom-inject",
};

export function buildTestGenUserPrompt(
  finding: Finding,
  packageName: string,
  sourceCode: string,
  exampleTest: string,
): string {
  return `## Finding
- Capability: ${finding.capability}
- Confidence: ${finding.confidence}
- Location: ${finding.fileLine}
- Problem: ${finding.problem}
- Evidence: ${finding.evidence}
- Reproduction Strategy: ${finding.reproductionStrategy}

## Package Source Code
${sourceCode}

## Reference Example Test
${exampleTest}

## Task
Generate a Vitest test that proves the "${finding.capability}" behavior described above.
The package name for runPackage() is: "${packageName}"
Determine the correct entry point from the source code and finding location.
Output ONLY the JavaScript test code.`;
}
