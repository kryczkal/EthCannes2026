import test from "node:test";
import assert from "node:assert/strict";

import { SYSTEM_PROMPT, buildUserPrompt } from "../../src/investigation/prompt.ts";

test("SYSTEM_PROMPT describes the investigation mission and workflow", () => {
  assert.match(SYSTEM_PROMPT, /senior security researcher/);
  assert.match(SYSTEM_PROMPT, /Start by listing files/);
  assert.match(SYSTEM_PROMPT, /Use require_and_trace\(\) to execute the package/);
  assert.match(SYSTEM_PROMPT, /If the package has lifecycle hooks/);
  assert.match(SYSTEM_PROMPT, /fast_forward_timers\(\)/);
});

test("SYSTEM_PROMPT defines confidence levels explicitly", () => {
  assert.match(SYSTEM_PROMPT, /SUSPECTED: Code pattern looks suspicious/);
  assert.match(SYSTEM_PROMPT, /LIKELY: Multiple corroborating signals/);
  assert.match(SYSTEM_PROMPT, /CONFIRMED: You observed the behavior in sandbox execution/);
});

test("SYSTEM_PROMPT warns against fabricated evidence", () => {
  assert.match(SYSTEM_PROMPT, /NEVER fabricate, invent, or hallucinate trace logs/);
  assert.match(SYSTEM_PROMPT, /you CANNOT mark it CONFIRMED/);
});

test("buildUserPrompt includes package identity and description", () => {
  const prompt = buildUserPrompt({
    packagePath: "/tmp/pkg",
    packageName: "axios",
    version: "1.8.0",
    description: "HTTP client",
    flags: [],
    staticCaps: [],
    staticProofSummaries: [],
  });

  assert.match(prompt, /## Package: axios@1\.8\.0/);
  assert.match(prompt, /Description: HTTP client/);
});

test("buildUserPrompt falls back for missing package metadata", () => {
  const prompt = buildUserPrompt({
    packagePath: "/tmp/pkg",
    packageName: "",
    version: "",
    description: "",
    flags: [],
    staticCaps: [],
    staticProofSummaries: [],
  });

  assert.match(prompt, /## Package: unknown@\?/);
  assert.match(prompt, /Description: N\/A/);
});

test("buildUserPrompt includes inventory flags when present", () => {
  const prompt = buildUserPrompt({
    packagePath: "/tmp/pkg",
    packageName: "fixture",
    version: "1.0.0",
    description: "fixture package",
    flags: ["preinstall hook", "obfuscated string decoding"],
    staticCaps: [],
    staticProofSummaries: [],
  });

  assert.match(prompt, /## Inventory Flags/);
  assert.match(prompt, /preinstall hook/);
  assert.match(prompt, /obfuscated string decoding/);
});

test("buildUserPrompt includes static capabilities when present", () => {
  const prompt = buildUserPrompt({
    packagePath: "/tmp/pkg",
    packageName: "fixture",
    version: "1.0.0",
    description: "fixture package",
    flags: [],
    staticCaps: ["ENV_VARS", "NETWORK"],
    staticProofSummaries: [],
  });

  assert.match(prompt, /## Capabilities detected by static analysis/);
  assert.match(prompt, /ENV_VARS, NETWORK/);
});

test("buildUserPrompt lists prior findings as bullet points", () => {
  const prompt = buildUserPrompt({
    packagePath: "/tmp/pkg",
    packageName: "fixture",
    version: "1.0.0",
    description: "fixture package",
    flags: [],
    staticCaps: [],
    staticProofSummaries: [
      "index.js reads process.env.NPM_TOKEN",
      "telemetry.js posts data to a remote endpoint",
    ],
  });

  assert.match(prompt, /## Prior findings \(from static analysis\)/);
  assert.match(prompt, /- index\.js reads process\.env\.NPM_TOKEN/);
  assert.match(prompt, /- telemetry\.js posts data to a remote endpoint/);
});

test("buildUserPrompt always ends with the investigation instructions", () => {
  const prompt = buildUserPrompt({
    packagePath: "/tmp/pkg",
    packageName: "fixture",
    version: "1.0.0",
    description: "fixture package",
    flags: [],
    staticCaps: [],
    staticProofSummaries: [],
  });

  assert.match(prompt, /## Instructions/);
  assert.match(prompt, /Investigate this package using the tools available to you/);
  assert.match(prompt, /Report all findings with evidence\./);
});
