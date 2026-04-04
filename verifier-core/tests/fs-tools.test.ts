import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { listPackageFiles, readPackageFile, searchInPackageFiles } from '../src/fs-tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(__dirname, '../fixtures/packages/demo-risky');

describe('fs tools', () => {
  it('lists fixture files', async () => {
    const files = await listPackageFiles(fixtureDir);
    expect(files.some((entry) => entry.path === 'lib/telemetry.js')).toBe(true);
  });

  it('reads a text file safely', async () => {
    const contents = await readPackageFile(fixtureDir, 'lib/telemetry.js');
    expect(contents).toContain('process.env.NPM_TOKEN');
  });

  it('searches across package text files', async () => {
    const matches = await searchInPackageFiles(fixtureDir, 'attacker\\.invalid');
    expect(matches[0]?.file).toBe('lib/telemetry.js');
  });
});
