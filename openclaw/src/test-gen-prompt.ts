import type { TestGenInput } from './schemas.js';
import { TOOL_DESCRIPTIONS } from './tools.js';

const SYSTEM_PROMPT = `You are a security test engineer for NpmGuard. Your task is to generate Vitest test scripts that prove specific malicious behaviors in npm packages.

## Test Environment
- Vitest with globals: true (describe, it, expect, vi are available globally — do NOT import them)
- MSW (Mock Service Worker) for HTTP interception: require("msw") and require("msw/node")
- sandbox-runner.js: runPackage(packageName, entryPoint) loads a package in an isolated require context
- server.js: exports { server } — an MSW setupServer() instance
- setup.js: handles server.listen/resetHandlers/close lifecycle automatically (beforeAll/afterEach/afterAll)

## Available Vitest APIs
- vi.stubEnv(key, value) / vi.unstubAllEnvs()
- vi.spyOn(object, method).mockImplementation(fn) / .mockReturnValue(val)
- vi.useFakeTimers() / vi.advanceTimersByTimeAsync(ms) / vi.useRealTimers()
- vi.fn()
- expect(...).toBeDefined(), .toHaveBeenCalled(), .toContain(), .toBe(), .toBeGreaterThan(), etc.

## MSW Patterns
- const { http, HttpResponse } = require("msw");
- http.get(pattern, handler), http.post(pattern, handler), http.all(pattern, handler)
- HttpResponse.text("ok"), HttpResponse.json({...})
- server.use(...) inside beforeEach or it() to add request handlers

## Critical Rules
1. Output ONLY raw JavaScript code. No markdown fences, no explanation, no prose.
2. Use CommonJS (require), NOT ESM (import). The test runner uses CommonJS.
3. Do NOT import vi, describe, it, expect — they are globals (globals: true).
4. Use runPackage(packageName, entryPoint) from "../harness/sandbox-runner" to load the package.
5. The packageName argument is the directory name of the package (e.g. "test-pkg-env-exfil").
6. Mock/intercept ALL external I/O: network via MSW server.use(), fs via vi.spyOn(fs, method).
7. Assert on OBSERVABLE BEHAVIOR (spies called, HTTP body captured, env accessed), not code structure.
8. Clean up in afterEach: vi.unstubAllEnvs(), vi.useRealTimers() if fake timers used.
9. Add a short await (e.g. await new Promise(r => setTimeout(r, 300))) after runPackage for async ops.
10. For DoS/infinite-loop tests, use runInChildProcess from "../harness/child-process-runner" with a timeout.

## Example: Environment variable exfiltration test
\`\`\`javascript
const os = require("os");
const fs = require("fs");

const { runPackage } = require("../harness/sandbox-runner");
const { http, HttpResponse } = require("msw");
const { server } = require("../harness/server");

describe("test-pkg-env-exfil (credential theft)", () => {
  beforeEach(() => {
    vi.stubEnv("NPM_TOKEN", "npm_FAKE_TOKEN_12345");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIAFAKEKEY");
    vi.stubEnv("GITHUB_TOKEN", "ghp_faketoken123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("harvests sensitive env vars, reads credential files, and exfiltrates", async () => {
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
    expect(exfilBody.env).toBeDefined();
    expect(exfilBody.hostname).toBeDefined();
  });
});
\`\`\`

## Example: Obfuscated binary dropper test
\`\`\`javascript
const fs = require("fs");

const { runPackage } = require("../harness/sandbox-runner");
const { http, HttpResponse } = require("msw");
const { server } = require("../harness/server");

describe("test-pkg-obfuscated-dropper (binary download)", () => {
  it("downloads payload, writes to disk, sets up beacon interval", async () => {
    let payloadRequested = false;
    server.use(
      http.get("http://localhost:9999/payload", () => {
        payloadRequested = true;
        return HttpResponse.text("FAKE_PAYLOAD_BINARY");
      }),
      http.post("http://localhost:9999/beacon", async ({ request }) => {
        return HttpResponse.text("ok");
      })
    );

    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
    const chmodSpy = vi.spyOn(fs, "chmodSync").mockImplementation(() => {});

    await runPackage("test-pkg-obfuscated-dropper", "setup.js");
    await new Promise(r => setTimeout(r, 200));

    expect(payloadRequested).toBe(true);
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("/tmp"), expect.anything());
  });
});
\`\`\`

## Your workflow
1. Use tools to read the package files and understand the malicious behavior.
2. Identify the entry point(s) that trigger the malicious behavior.
3. Determine what to mock (env vars, fs, network) and what to assert.
4. Generate the test code.
5. Return a final JSON response with the tests.`;

export function buildTestGenConversation(input: TestGenInput) {
  return [
    {
      role: 'system' as const,
      content: SYSTEM_PROMPT,
    },
    {
      role: 'user' as const,
      content: [
        'Generate Vitest proof tests for the following findings.',
        'First investigate the package using the available tools, then generate test code.',
        '',
        JSON.stringify(
          {
            package_name: input.package_name,
            package_version: input.package_version,
            findings: input.findings,
          },
          null,
          2,
        ),
      ].join('\n'),
    },
  ];
}

export function buildTestGenTurnPrompt(
  input: TestGenInput,
  conversation: Array<{ role: 'system' | 'user' | 'tool'; content: string }>,
) {
  return [
    'You are running inside a bounded test-generation loop.',
    'Reply with exactly one JSON object and nothing else.',
    'Do not wrap JSON in Markdown fences.',
    '',
    'If you need to investigate the package first, emit a tool_call:',
    '{"type":"tool_call","tool":"read_file","input":{"filePath":"setup.js"},"reason":"Read the entry point"}',
    '',
    'Available tools:',
    JSON.stringify(TOOL_DESCRIPTIONS, null, 2),
    '',
    'When you are done investigating, emit the final response with generated test code:',
    '{"type":"final","tests":[{"finding_id":"finding-0","test_code":"const fs = require(\\"fs\\");...","entry_point":"setup.js","rationale":"Test proves env var exfiltration by..."}]}',
    '',
    'IMPORTANT: test_code must be raw JavaScript (CommonJS), NOT wrapped in markdown fences.',
    'The test_code must be a complete, self-contained .test.js file.',
    `The package name for runPackage() is: "${input.package_name}"`,
    '',
    'Conversation so far:',
    JSON.stringify(conversation, null, 2),
  ].join('\n');
}
