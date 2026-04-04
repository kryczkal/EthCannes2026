import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { DockerSandbox } from '../src/docker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(__dirname, '../fixtures/packages/demo-risky');
const dockerEnabled = process.env.RUN_DOCKER_TESTS === '1';

describe.skipIf(!dockerEnabled)('docker sandbox', () => {
  let sandbox: DockerSandbox;

  beforeAll(() => {
    sandbox = new DockerSandbox({ packageDir: fixtureDir, execTimeoutMs: 15000 });
  });

  it('starts, executes, and stops', async () => {
    await sandbox.start();
    const result = await sandbox.exec(['node', '-e', 'console.log("hello from sandbox")']);
    await sandbox.stop();

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello from sandbox');
  });
});
