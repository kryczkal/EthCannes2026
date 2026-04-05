import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { verificationInputSchema, verificationOutputSchema } from '../../src/schemas.ts';
import { buildConversation, buildTurnPrompt } from '../../src/prompt.ts';

const fixtureDir = '/Users/piotrtyrakowski/repos/EthCannes2026/openclaw/fixtures';

test('axios candidate fixture is valid against the verification input schema', async () => {
  const raw = await fs.readFile(path.join(fixtureDir, 'axios-1.8.0.candidates.json'), 'utf8');
  const parsed = verificationInputSchema.parse(JSON.parse(raw));

  assert.equal(parsed.package_name, 'axios');
  assert.equal(parsed.package_version, '1.8.0');
  assert.equal(parsed.candidates.length, 1);
});

test('axios output fixture is valid against the verification output schema', async () => {
  const raw = await fs.readFile(path.join(fixtureDir, 'axios-1.8.0.output.json'), 'utf8');
  const parsed = verificationOutputSchema.parse(JSON.parse(raw));

  assert.equal(parsed.verifier, 'openclaw');
  assert.equal(parsed.results[0]?.status, 'confirmed');
});

test('candidate fixture can be embedded into the conversation prompt', async () => {
  const raw = await fs.readFile(path.join(fixtureDir, 'axios-1.8.0.candidates.json'), 'utf8');
  const parsed = verificationInputSchema.parse(JSON.parse(raw));
  const conversation = buildConversation(parsed);
  const turnPrompt = buildTurnPrompt(parsed, conversation);

  assert.match(turnPrompt, /axios/);
  assert.match(turnPrompt, /lib\/telemetry\.js/);
  assert.match(turnPrompt, /Reads environment variables and exfiltrates them over HTTP/);
});
