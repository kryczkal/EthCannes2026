import test from 'node:test';
import assert from 'node:assert/strict';

import { buildConversation, buildTurnPrompt } from '../../src/prompt.ts';

const input = {
  package_dir: '/tmp/pkg',
  package_name: 'axios',
  package_version: '1.8.0',
  candidates: [
    {
      id: 'cand-001',
      file_name: 'lib/telemetry.js',
      where: '1-20',
      potential_vulnerability: 'Reads environment variables and exfiltrates them over HTTP',
    },
  ],
};

test('buildConversation creates a system and user message pair', () => {
  const conversation = buildConversation(input);

  assert.equal(conversation.length, 2);
  assert.equal(conversation[0]?.role, 'system');
  assert.equal(conversation[1]?.role, 'user');
});

test('buildConversation system prompt enforces JSON-only responses', () => {
  const conversation = buildConversation(input);
  const system = conversation[0]?.content ?? '';

  assert.match(system, /Every response must be exactly one JSON object/);
  assert.match(system, /Do not output prose, Markdown, or code fences/);
  assert.match(system, /Use only these status values: confirmed, rejected, inconclusive/);
});

test('buildConversation embeds the original input as pretty JSON', () => {
  const conversation = buildConversation(input);
  const user = conversation[1]?.content ?? '';

  assert.match(user, /"package_name": "axios"/);
  assert.match(user, /"file_name": "lib\/telemetry\.js"/);
  assert.match(user, /"potential_vulnerability": "Reads environment variables and exfiltrates them over HTTP"/);
});

test('buildTurnPrompt includes bounded-loop instructions and tool descriptions', () => {
  const conversation = buildConversation(input);
  const prompt = buildTurnPrompt(input, conversation);

  assert.match(prompt, /bounded verification loop/);
  assert.match(prompt, /Reply with exactly one JSON object/);
  assert.match(prompt, /Available tools:/);
  assert.match(prompt, /"read_file": "Read a text file from the package\."/);
  assert.match(prompt, /"run_npm_script": "Run one npm script with instrumentation enabled\."/);
});

test('buildTurnPrompt contains both tool_call and final JSON examples', () => {
  const conversation = buildConversation(input);
  const prompt = buildTurnPrompt(input, conversation);

  assert.match(prompt, /\{"type":"tool_call","tool":"read_file"/);
  assert.match(prompt, /\{"type":"final","results":\[/);
});

test('buildTurnPrompt serializes conversation history and original input', () => {
  const conversation = [
    ...buildConversation(input),
    {
      role: 'tool' as const,
      content: JSON.stringify({
        tool: 'read_file',
        result: 'const token = process.env.NPM_TOKEN;',
      }),
    },
  ];

  const prompt = buildTurnPrompt(input, conversation);

  assert.match(prompt, /Conversation so far:/);
  assert.match(prompt, /"role": "tool"/);
  assert.match(prompt, /Original input:/);
  assert.match(prompt, /"package_version": "1\.8\.0"/);
});

test('buildTurnPrompt forbids markdown fences explicitly', () => {
  const prompt = buildTurnPrompt(input, buildConversation(input));
  assert.match(prompt, /Do not wrap JSON in Markdown fences/);
});

test('buildTurnPrompt keeps the package-specific candidate data visible', () => {
  const prompt = buildTurnPrompt(input, buildConversation(input));
  assert.match(prompt, /lib\/telemetry\.js/);
  assert.match(prompt, /Reads environment variables and exfiltrates them over HTTP/);
});
