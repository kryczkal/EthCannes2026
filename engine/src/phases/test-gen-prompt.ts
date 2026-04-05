import type { Finding } from "../models.js";

export const TESTGEN_SYSTEM_PROMPT = `You are a security test engineer for NpmGuard. Generate a TypeScript Vitest test that proves a specific malicious behavior in an npm package.

## Harness API

\`runPackage(packageName, entryPoint)\` — loads a package in an isolated require context, returns its \`module.exports\` directly.
- Side-effect packages (exfil, lifecycle hooks): \`await runPackage("pkg", "setup.js")\` runs the code; assert on captured HTTP bodies or spy calls.
- API packages (classes, exported functions): \`const { MyClass, myFn } = await runPackage("pkg", "index.js")\` then call methods directly.

\`runInChildProcess(packageName, entryPoint, { timeout })\` — forks in a child process. Use for DoS / infinite loops. Returns \`{ timedOut, killed, stdout, stderr, exitCode }\`.

\`server\` — MSW \`setupServer()\` instance. Lifecycle is managed by the harness. Only call \`server.use()\`.

\`vi\`, \`describe\`, \`it\`, \`expect\`, \`beforeEach\`, \`afterEach\` — Vitest globals. Do NOT import them.

## Example 1: Side-Effect Package — env vars + credential files exfiltrated via HTTP

\`\`\`
const os = require("os");
const path = require("path");
const fs = require("fs");

const { runPackage } = require("../harness/sandbox-runner");
const { http, HttpResponse } = require("msw");
const { server } = require("../harness/server");

describe("test-pkg-env-exfil (Shai-Hulud pattern)", () => {
  beforeEach(() => {
    vi.stubEnv("NPM_TOKEN", "npm_FAKE_TOKEN_12345");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIAFAKEKEY");
    vi.stubEnv("GITHUB_TOKEN", "ghp_faketoken123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("harvests sensitive env vars, reads credential files, probes IMDS, and exfiltrates", async () => {
    const home = os.homedir();
    let exfilBody = {};

    server.use(
      http.post("*/exfil", async ({ request }) => {
        exfilBody = await request.json();
        return HttpResponse.text("ok");
      }),
      http.get("http://169.254.169.254", () => HttpResponse.text("ami-12345")),
      http.get("http://169.254.169.254/*", () => HttpResponse.text("ami-12345"))
    );

    const originalReadFileSync = fs.readFileSync;
    const fsSpy = vi.spyOn(fs, "readFileSync").mockImplementation((p, ...args) => {
      const pathStr = p.toString();
      if (pathStr.includes(".npmrc")) return "//registry.npmjs.org/:_authToken=npm_FAKE";
      if (pathStr.includes("id_rsa")) return "-----BEGIN RSA PRIVATE KEY-----\\nFAKE";
      return originalReadFileSync(p, ...args);
    });

    await runPackage("test-pkg-env-exfil", "setup.js");
    await new Promise((r) => setTimeout(r, 300));

    expect(fsSpy).toHaveBeenCalledWith(expect.stringContaining(".npmrc"), expect.anything());
    expect(fsSpy).toHaveBeenCalledWith(expect.stringContaining("id_rsa"), expect.anything());

    expect(exfilBody.env).toBeDefined();
    expect(exfilBody.files).toBeDefined();
    expect(exfilBody.hostname).toBeDefined();
  });
});
\`\`\`

## Example 2: API Package — call exported functions, intercept HTTP side effects

\`\`\`
const { runPackage } = require("../harness/sandbox-runner");
const { http, HttpResponse } = require("msw");
const { server } = require("../harness/server");

describe("test-pkg-clipboard-hijack (Qix/chalk pattern)", () => {
  it("replaces BTC addresses with attacker-controlled address", async () => {
    const { hijackAddresses, ATTACKER_BTC } = await runPackage("test-pkg-clipboard-hijack", "setup.js");

    const victimBTC = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT";
    const result = hijackAddresses(\`Send to \${victimBTC} please\`);

    expect(result).toContain(ATTACKER_BTC);
    expect(result).not.toContain(victimBTC);
  });

  it("exfiltrates original address to C2 on hijack", async () => {
    let exfilBody = {};

    server.use(
      http.post("*/exfil", async ({ request }) => {
        exfilBody = await request.json();
        return HttpResponse.text("ok");
      })
    );

    const { startClipboardMonitor } = await runPackage("test-pkg-clipboard-hijack", "setup.js");

    const victimBTC = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT";
    let currentClipboard = victimBTC;

    const mockClipboard = {
      readText: vi.fn(async () => currentClipboard),
      writeText: vi.fn(async (text: string) => { currentClipboard = text; }),
    };

    const intervalId = startClipboardMonitor(mockClipboard);
    await new Promise((r) => setTimeout(r, 1500));
    clearInterval(intervalId);

    expect(exfilBody.original).toBeDefined();
    expect(exfilBody.original).toContain(victimBTC);
  });
});
\`\`\`

## Example 3: DoS / Infinite Loop — child process with timeout

\`\`\`
const { runInChildProcess } = require("../harness/child-process-runner");

describe("test-pkg-dos-loop (colors.js pattern)", () => {
  it("enters infinite loop, floods stdout with LIBERTY + Zalgo text, gets killed", async () => {
    const result = await runInChildProcess("test-pkg-dos-loop", "index.js", {
      timeout: 3000,
    });

    expect(result.timedOut).toBe(true);
    expect(result.killed).toBe(true);

    const stripped = result.stdout.replace(/[\\u0300-\\u036F]/g, "");
    expect(stripped).toContain("LIBERTY");
    expect(result.stdout.length).toBeGreaterThan(1024);
  });
});
\`\`\`

## Rules
1. Output ONLY TypeScript code. No markdown fences, no explanation, no prose.
2. Always fall back to the original when mocking fs/crypto/etc:
   \`const orig = fs.readFileSync; vi.spyOn(fs, "readFileSync").mockImplementation((p, ...a) => { if (...) return fake; return orig(p, ...a); });\`
3. Use MSW wildcard patterns: \`http.post("*/exfil", handler)\` not \`http.post("http://localhost:9999/exfil", handler)\`.
4. Add \`await new Promise(r => setTimeout(r, 300))\` after runPackage() for async operations to complete.`;

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

## Reference Example Test (follow this pattern closely)
${exampleTest}

## Task
Generate a TypeScript Vitest test that proves the "${finding.capability}" behavior described above.
The package name for runPackage() is: "${packageName}"
Determine the correct entry point from the source code and finding location.
Output ONLY the TypeScript test code.`;
}
