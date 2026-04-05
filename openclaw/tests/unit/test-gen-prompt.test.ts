import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTestGenConversation, buildTestGenTurnPrompt } from '../../src/test-gen-prompt.ts';

const input = {
  package_dir: '/tmp/pkg',
  package_name: 'test-pkg-env-exfil',
  package_version: '1.0.0',
  findings: [
    {
      id: 'finding-0',
      capability: 'environment',
      fileLine: 'setup.js:1-20',
      problem: 'Reads environment variables and exfiltrates them over the network',
      evidence: 'Observed env reads and HTTP POST',
      reproductionStrategy: 'Load setup.js and intercept outbound requests',
    },
  ],
};

test('buildTestGenConversation returns a system prompt plus user payload', () => {
  const conversation = buildTestGenConversation(input);
  assert.equal(conversation.length, 2);
  assert.equal(conversation[0]?.role, 'system');
  assert.equal(conversation[1]?.role, 'user');
});

test('buildTestGenConversation system prompt includes Vitest and MSW guidance', () => {
  const system = buildTestGenConversation(input)[0]?.content ?? '';

  assert.match(system, /Vitest with globals: true/);
  assert.match(system, /MSW \(Mock Service Worker\)/);
  assert.match(system, /Use CommonJS \(require\), NOT ESM/);
  assert.match(system, /runPackage\(packageName, entryPoint\)/);
});

test('buildTestGenConversation includes concrete examples for test generation', () => {
  const system = buildTestGenConversation(input)[0]?.content ?? '';

  assert.match(system, /Environment variable exfiltration test/);
  assert.match(system, /Obfuscated binary dropper test/);
  assert.match(system, /vi\.stubEnv/);
  assert.match(system, /server\.use/);
});

test('buildTestGenConversation user prompt contains the findings payload', () => {
  const user = buildTestGenConversation(input)[1]?.content ?? '';

  assert.match(user, /Generate Vitest proof tests/);
  assert.match(user, /"package_name": "test-pkg-env-exfil"/);
  assert.match(user, /"problem": "Reads environment variables and exfiltrates them over the network"/);
});

test('buildTestGenTurnPrompt includes the bounded loop contract', () => {
  const prompt = buildTestGenTurnPrompt(input, buildTestGenConversation(input));

  assert.match(prompt, /bounded test-generation loop/);
  assert.match(prompt, /Reply with exactly one JSON object/);
  assert.match(prompt, /Do not wrap JSON in Markdown fences/);
});

test('buildTestGenTurnPrompt includes a tool_call example and final response example', () => {
  const prompt = buildTestGenTurnPrompt(input, buildTestGenConversation(input));

  assert.match(prompt, /\{"type":"tool_call","tool":"read_file"/);
  assert.match(prompt, /\{"type":"final","tests":\[/);
});

test('buildTestGenTurnPrompt tells the model to return raw CommonJS test code', () => {
  const prompt = buildTestGenTurnPrompt(input, buildTestGenConversation(input));

  assert.match(prompt, /test_code must be raw JavaScript \(CommonJS\)/);
  assert.match(prompt, /must be a complete, self-contained \.test\.js file/);
});

test('buildTestGenTurnPrompt includes tool descriptions and package name', () => {
  const prompt = buildTestGenTurnPrompt(input, buildTestGenConversation(input));

  assert.match(prompt, /"require_and_trace": "Require a package file with instrumentation enabled and return trace JSON\."/);
  assert.match(prompt, /The package name for runPackage\(\) is: "test-pkg-env-exfil"/);
});

test('buildTestGenTurnPrompt serializes prior conversation history', () => {
  const conversation = [
    ...buildTestGenConversation(input),
    {
      role: 'tool' as const,
      content: JSON.stringify({
        tool: 'read_file',
        result: "module.exports = require('./setup');",
      }),
    },
  ];
  const prompt = buildTestGenTurnPrompt(input, conversation);

  assert.match(prompt, /Conversation so far:/);
  assert.match(prompt, /"role": "tool"/);
  assert.match(prompt, /module\.exports = require/);
});
