import test from "node:test";
import assert from "node:assert/strict";

import {
  CAPABILITY_EXAMPLES,
  TESTGEN_SYSTEM_PROMPT,
  buildTestGenUserPrompt,
} from "../../src/phases/test-gen-prompt.ts";

const finding = {
  capability: "ENV_VARS",
  confidence: "CONFIRMED" as const,
  fileLine: "index.js:1-20",
  problem: "Reads environment variables and exfiltrates them",
  evidence: "Observed process.env reads and HTTP POST",
  reproductionStrategy: "Run the package and intercept outbound requests",
};

test("TESTGEN_SYSTEM_PROMPT encodes the critical Vitest and MSW rules", () => {
  assert.match(TESTGEN_SYSTEM_PROMPT, /Output ONLY raw JavaScript \(CommonJS\)/);
  assert.match(TESTGEN_SYSTEM_PROMPT, /Do NOT call server\.listen\(\), server\.close\(\), or server\.resetHandlers\(\)/);
  assert.match(TESTGEN_SYSTEM_PROMPT, /Use runPackage\(packageName, entryPoint\)/);
  assert.match(TESTGEN_SYSTEM_PROMPT, /Use WILDCARD patterns, not exact URLs/);
});

test("TESTGEN_SYSTEM_PROMPT includes the fs spy fallback guidance", () => {
  assert.match(TESTGEN_SYSTEM_PROMPT, /ALWAYS preserve the original and fall back to it/);
  assert.match(TESTGEN_SYSTEM_PROMPT, /return originalReadFileSync/);
  assert.match(TESTGEN_SYSTEM_PROMPT, /Never throw or return undefined for unrecognized paths/);
});

test("TESTGEN_SYSTEM_PROMPT includes the canonical pattern template", () => {
  assert.match(TESTGEN_SYSTEM_PROMPT, /const fs = require\("fs"\);/);
  assert.match(TESTGEN_SYSTEM_PROMPT, /const \{ runPackage \} = require\("\.\.\/harness\/sandbox-runner"\);/);
  assert.match(TESTGEN_SYSTEM_PROMPT, /describe\("package-name \(capability\)"/);
});

test("CAPABILITY_EXAMPLES maps common capabilities to exploit fixture names", () => {
  assert.equal(CAPABILITY_EXAMPLES.ENV_VARS, "env-exfil");
  assert.equal(CAPABILITY_EXAMPLES.DNS_EXFIL, "dns-exfil");
  assert.equal(CAPABILITY_EXAMPLES.DOS_LOOP, "dos-loop");
  assert.equal(CAPABILITY_EXAMPLES.TELEMETRY_RAT, "telemetry-rat");
  assert.equal(CAPABILITY_EXAMPLES.DOM_INJECT, "dom-inject");
});

test("buildTestGenUserPrompt includes the finding details and source code", () => {
  const prompt = buildTestGenUserPrompt(
    finding,
    "fixture-pkg",
    "const token = process.env.NPM_TOKEN;",
    "describe('example', () => {});",
  );

  assert.match(prompt, /Capability: ENV_VARS/);
  assert.match(prompt, /Confidence: CONFIRMED/);
  assert.match(prompt, /Location: index\.js:1-20/);
  assert.match(prompt, /const token = process\.env\.NPM_TOKEN;/);
});

test("buildTestGenUserPrompt embeds the reference example test and package name", () => {
  const prompt = buildTestGenUserPrompt(
    finding,
    "fixture-pkg",
    "module.exports = 1;",
    "describe('example', () => { it('works', () => {}); });",
  );

  assert.match(prompt, /Reference Example Test/);
  assert.match(prompt, /describe\('example'/);
  assert.match(prompt, /The package name for runPackage\(\) is: "fixture-pkg"/);
});

test("buildTestGenUserPrompt repeats the critical output constraints", () => {
  const prompt = buildTestGenUserPrompt(
    finding,
    "fixture-pkg",
    "module.exports = 1;",
    "describe('example', () => {});",
  );

  assert.match(prompt, /Do NOT call server\.listen\/close\/resetHandlers/);
  assert.match(prompt, /Use wildcard MSW patterns/);
  assert.match(prompt, /Output ONLY the JavaScript test code/);
});
