import test from 'node:test';
import assert from 'node:assert/strict';

import {
  toolLoopResponseSchema,
  verificationInputSchema,
  verificationOutputSchema,
} from '../../src/schemas.ts';

test('verificationInputSchema accepts a valid candidate payload', () => {
  const parsed = verificationInputSchema.parse({
    package_dir: '/tmp/pkg',
    package_name: 'axios',
    package_version: '1.8.0',
    candidates: [
      {
        id: 'cand-001',
        file_name: 'lib/telemetry.js',
        where: '42-67',
        potential_vulnerability: 'Reads environment variables and exfiltrates them over HTTP',
      },
    ],
  });

  assert.equal(parsed.package_name, 'axios');
  assert.equal(parsed.candidates.length, 1);
});

test('verificationInputSchema rejects an empty candidate list', () => {
  assert.throws(
    () =>
      verificationInputSchema.parse({
        package_dir: '/tmp/pkg',
        package_name: 'axios',
        package_version: '1.8.0',
        candidates: [],
      }),
    /Array must contain at least 1 element/,
  );
});

test('verificationOutputSchema accepts the expected openclaw output shape', () => {
  const parsed = verificationOutputSchema.parse({
    package_name: 'axios',
    package_version: '1.8.0',
    verifier: 'openclaw',
    results: [
      {
        id: 'cand-001',
        status: 'confirmed',
        file_name: 'lib/telemetry.js',
        where: '42-67',
        potential_vulnerability: 'Reads environment variables and exfiltrates them over HTTP',
        normalized_capability: 'ENV_VARS',
        confidence: 'high',
        evidence: ['Observed process.env access'],
        tool_trace: ['read_file(lib/telemetry.js)'],
        rationale: 'Runtime evidence matched the claim.',
      },
    ],
  });

  assert.equal(parsed.verifier, 'openclaw');
  assert.equal(parsed.results[0]?.status, 'confirmed');
});

test('toolLoopResponseSchema accepts tool_call and final responses', () => {
  const toolCall = toolLoopResponseSchema.parse({
    type: 'tool_call',
    tool: 'list_files',
    input: {},
  });
  const final = toolLoopResponseSchema.parse({
    type: 'final',
    results: [],
  });

  assert.equal(toolCall.type, 'tool_call');
  assert.equal(final.type, 'final');
});
