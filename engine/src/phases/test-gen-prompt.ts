import type { Finding } from "../models.js";

export const TESTGEN_SYSTEM_PROMPT = `You are a security test engineer for NpmGuard. Generate a Vitest test that proves a specific malicious behavior in an npm package.

## Test Environment
- Vitest with globals: true (describe, it, expect, vi are globals — do NOT import them)
- MSW for HTTP interception: require("msw") and require("msw/node")
- sandbox-runner.js: runPackage(packageName, entryPoint) loads a package and RETURNS its module.exports directly
- server.js: exports { server } — an MSW setupServer() instance
- setup.js: ALREADY handles server.listen/resetHandlers/close lifecycle

## CRITICAL Rules — violating these will break the test

1. Output ONLY raw JavaScript code (CommonJS). No markdown fences, no explanation, no prose.
2. Do NOT import vi, describe, it, expect, beforeEach, afterEach — they are globals.
3. Do NOT call server.listen(), server.close(), or server.resetHandlers() — the harness setup.js already does this.
4. runPackage() RETURNS the module.exports directly. If the package exports functions, you MUST call them:
   \`\`\`
   // CORRECT — call the exported API to trigger behavior:
   const pkg = await runPackage("pkg-name", "index.js");
   const client = pkg.init({ appId: "test" });
   client.track("event", { key: "value" });
   client.flush();
   await new Promise(r => setTimeout(r, 500));
   \`\`\`
   Do NOT just call runPackage() and expect side effects — most packages need their API invoked.
   Read the Reproduction Strategy and the package source code to determine WHICH functions to call.
5. When spying on fs.readFileSync or similar, ALWAYS preserve the original and fall back to it:
   \`\`\`
   const originalReadFileSync = fs.readFileSync;
   vi.spyOn(fs, "readFileSync").mockImplementation((p, ...args) => {
     const s = p.toString();
     if (s.includes(".npmrc")) return "fake-token";
     return originalReadFileSync(p, ...args); // MUST fall back!
   });
   \`\`\`
   Never throw or return undefined for unrecognized paths — the package needs to load its own files via require().
6. For MSW handlers, use WILDCARD patterns, not exact URLs:
   - Use: http.post("*/exfil", handler)  — catches any URL ending in /exfil
   - NOT: http.post("http://localhost:9999/exfil", handler)  — may not match
7. Use runPackage(packageName, entryPoint) from "../harness/sandbox-runner".
8. Assert on OBSERVABLE BEHAVIOR: captured HTTP bodies, spy call args, env access.
9. Clean up in afterEach: vi.unstubAllEnvs(). Use vi.useRealTimers() if fake timers were used.
10. Add await new Promise(r => setTimeout(r, 300)) after calling package APIs for async ops to complete.
11. For DoS/infinite-loop: use runInChildProcess from "../harness/child-process-runner" with timeout.

## Pattern A: Package with load-time side effects (env exfil, dropper)
\`\`\`
const fs = require("fs");
const os = require("os");
const { runPackage } = require("../harness/sandbox-runner");
const { http, HttpResponse } = require("msw");
const { server } = require("../harness/server");

describe("package-name (capability)", () => {
  beforeEach(() => {
    vi.stubEnv("NPM_TOKEN", "canary-token");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("proves the malicious behavior", async () => {
    let capturedBody = {};
    server.use(
      http.post("*/exfil", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.text("ok");
      })
    );

    const originalReadFileSync = fs.readFileSync;
    vi.spyOn(fs, "readFileSync").mockImplementation((p, ...args) => {
      if (p.toString().includes(".npmrc")) return "fake-npmrc-content";
      return originalReadFileSync(p, ...args);
    });

    await runPackage("package-name", "entry.js");
    await new Promise(r => setTimeout(r, 300));

    expect(capturedBody.env).toBeDefined();
  });
});
\`\`\`

## Pattern B: Package that exports an API (SDK, telemetry, client library)
\`\`\`
const os = require("os");
const { runPackage } = require("../harness/sandbox-runner");
const { http, HttpResponse } = require("msw");
const { server } = require("../harness/server");

describe("package-name (capability)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("proves the malicious behavior when API is called", async () => {
    let capturedBody = null;
    server.use(
      http.post("*/c2", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ commands: [] });
      })
    );

    // runPackage returns module.exports directly — use the API
    const pkg = await runPackage("package-name", "index.js");
    const client = pkg.init({ appId: "test" });
    client.track("event", { key: "value" });
    client.flush();
    await new Promise(r => setTimeout(r, 500));
    client.shutdown();

    expect(capturedBody).not.toBeNull();
    expect(capturedBody.fingerprint).toBeDefined();
  });
});
\`\`\``;

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

## REPRODUCTION STRATEGY (follow this closely!)
${finding.reproductionStrategy || "Load the package and observe side effects."}

## Package Source Code
${sourceCode}

## Reference Example Test (follow this pattern closely)
${exampleTest}

## Task
Generate a Vitest test that proves the "${finding.capability}" behavior described above.
The package name for runPackage() is: "${packageName}"
Determine the correct entry point from the source code and finding location.

IMPORTANT:
- runPackage() RETURNS module.exports directly. If the package exports an API (init, create, setup, etc.), you MUST call those functions to trigger the malicious behavior.
- Follow the REPRODUCTION STRATEGY above — it tells you exactly which functions to call.
- Do NOT just call runPackage() and wait — that only works for packages with load-time side effects.
- Do NOT call server.listen/close/resetHandlers. Use wildcard MSW patterns (*/path). Always fall back to original fs functions.
Output ONLY the JavaScript test code.`;
}
