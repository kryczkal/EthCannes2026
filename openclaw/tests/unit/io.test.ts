import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { loadVerificationInput, writeVerificationOutput } from '../../src/io.ts';
import { verificationOutputSchema } from '../../src/schemas.ts';

async function makeTempDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'openclaw-io-'));
}

test('loadVerificationInput parses a valid candidate file from disk', async (t) => {
  const dir = await makeTempDir();
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const filePath = path.join(dir, 'input.json');
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        package_dir: '/tmp/pkg',
        package_name: 'axios',
        package_version: '1.8.0',
        candidates: [
          {
            id: 'cand-001',
            file_name: 'index.js',
            where: '1-2',
            potential_vulnerability: 'network exfiltration',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  const input = await loadVerificationInput(filePath);
  assert.equal(input.package_name, 'axios');
  assert.equal(input.candidates[0]?.id, 'cand-001');
});

test('loadVerificationInput throws on invalid JSON syntax', async (t) => {
  const dir = await makeTempDir();
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const filePath = path.join(dir, 'broken.json');
  await fs.writeFile(filePath, '{"broken": ', 'utf8');

  await assert.rejects(() => loadVerificationInput(filePath));
});

test('loadVerificationInput throws on schema-invalid content', async (t) => {
  const dir = await makeTempDir();
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const filePath = path.join(dir, 'invalid.json');
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        package_dir: '/tmp/pkg',
        package_name: 'axios',
        package_version: '1.8.0',
        candidates: [],
      },
      null,
      2,
    ),
    'utf8',
  );

  await assert.rejects(() => loadVerificationInput(filePath));
});

test('writeVerificationOutput creates parent directories and writes normalized JSON', async (t) => {
  const dir = await makeTempDir();
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const filePath = path.join(dir, 'nested', 'verified.json');
  await writeVerificationOutput(filePath, {
    package_name: 'axios',
    package_version: '1.8.0',
    verifier: 'openclaw',
    results: [
      {
        id: 'cand-001',
        status: 'confirmed',
        file_name: 'index.js',
        where: '1-2',
        potential_vulnerability: 'network exfiltration',
        normalized_capability: 'network_exfiltration',
        confidence: 'high',
        evidence: ['Observed HTTP POST'],
        tool_trace: ['read_file(index.js)'],
        rationale: 'Observed evidence matched.',
      },
    ],
  });

  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = verificationOutputSchema.parse(JSON.parse(raw));
  assert.equal(parsed.results.length, 1);
  assert.match(raw, /\n$/);
});

test('writeVerificationOutput rejects invalid output payloads', async (t) => {
  const dir = await makeTempDir();
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const filePath = path.join(dir, 'verified.json');
  await assert.rejects(() =>
    writeVerificationOutput(filePath, {
      package_name: 'axios',
      package_version: '1.8.0',
      verifier: 'openclaw',
      results: [
        {
          id: 'cand-001',
          status: 'definitely',
          file_name: 'index.js',
          where: '1-2',
          potential_vulnerability: 'network exfiltration',
          normalized_capability: 'network_exfiltration',
          confidence: 'high',
          evidence: [],
          tool_trace: [],
          rationale: 'bad enum',
        },
      ],
    } as never),
  );
});
