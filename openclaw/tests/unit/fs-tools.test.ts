import test from 'node:test';
import assert from 'node:assert/strict';

import { listPackageFiles, readPackageFile, searchInPackageFiles } from '../../src/fs-tools.ts';
import { createPackageFixture } from '../helpers/package-fixture.ts';

test('listPackageFiles returns nested files and directories', async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });
  const files = await listPackageFiles(fixture.packageDir);
  const paths = files.map((file) => `${file.type}:${file.path}`).sort();

  assert.deepEqual(paths, [
    'dir:lib',
    'dir:scripts',
    'file:README.md',
    'file:binary.bin',
    'file:index.js',
    'file:lib/telemetry.js',
    'file:package.json',
    'file:scripts/postinstall.js',
  ]);
});

test('readPackageFile reads text files inside the package root', async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });
  const contents = await readPackageFile(fixture.packageDir, 'lib/telemetry.js');

  assert.match(contents, /process\.env\.NPM_TOKEN/);
});

test('readPackageFile rejects path traversal and non-text files', async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  await assert.rejects(() => readPackageFile(fixture.packageDir, '../outside.js'), /escapes package root/);
  await assert.rejects(() => readPackageFile(fixture.packageDir, 'binary.bin'), /Refusing to read non-text file/);
});

test('searchInPackageFiles finds matching lines with file and line number', async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });
  const matches = await searchInPackageFiles(fixture.packageDir, 'process\\.env');

  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0], {
    file: 'lib/telemetry.js',
    line: 1,
    excerpt: 'const token = process.env.NPM_TOKEN;',
  });
});

test('searchInPackageFiles is case-insensitive by default', async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });
  const matches = await searchInPackageFiles(fixture.packageDir, 'PROCESS\\.ENV');

  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.file, 'lib/telemetry.js');
});

test('searchInPackageFiles returns an empty array when there are no matches', async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });
  const matches = await searchInPackageFiles(fixture.packageDir, 'definitely_no_match_here');

  assert.deepEqual(matches, []);
});

test('searchInPackageFiles ignores binary files during search', async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });
  const matches = await searchInPackageFiles(fixture.packageDir, '\\x01');

  assert.deepEqual(matches, []);
});

test('searchInPackageFiles respects the maxMatches limit', async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  const matches = await searchInPackageFiles(fixture.packageDir, '.', 2);
  assert.equal(matches.length, 2);
});

test('readPackageFile preserves json formatting for package manifests', async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  const contents = await readPackageFile(fixture.packageDir, 'package.json');
  assert.match(contents, /"name": "fixture-pkg"/);
  assert.match(contents, /"postinstall": "node scripts\/postinstall\.js"/);
});

test('readPackageFile truncates very long files using the shared text helper', async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  const contents = await readPackageFile(fixture.packageDir, 'lib/telemetry.js', 10);
  assert.match(contents, /\.\.\.\[truncated \d+ chars\]/);
});
