import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { INSTRUMENTATION_SCRIPT } from './instrumentation.js';
import { truncateText } from './text.js';

export interface SandboxExecResult {
  command: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export interface DockerSandboxOptions {
  packageDir: string;
  image?: string;
  memoryMb?: number;
  cpus?: number;
  networkEnabled?: boolean;
  execTimeoutMs?: number;
}

async function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<SandboxExecResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        command: [command, ...args],
        stdout: truncateText(stdout, 20000),
        stderr: truncateText(stderr, 20000),
        exitCode: code,
        timedOut,
      });
    });
  });
}

export class DockerSandbox {
  private readonly options: Required<Omit<DockerSandboxOptions, 'packageDir'>> & Pick<DockerSandboxOptions, 'packageDir'>;

  private containerId: string | null = null;

  private instrumentationDir: string | null = null;

  constructor(options: DockerSandboxOptions) {
    this.options = {
      packageDir: path.resolve(options.packageDir),
      image: options.image ?? 'node:22-slim',
      memoryMb: options.memoryMb ?? 512,
      cpus: options.cpus ?? 1,
      networkEnabled: options.networkEnabled ?? false,
      execTimeoutMs: options.execTimeoutMs ?? 15000,
    };
  }

  async start(): Promise<void> {
    if (this.containerId) {
      return;
    }

    this.instrumentationDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verifier-instrumentation-'));
    await fs.writeFile(path.join(this.instrumentationDir, 'instrumentation.cjs'), INSTRUMENTATION_SCRIPT, 'utf8');

    const args = [
      'run',
      '-d',
      '--rm',
      '--read-only',
      '--tmpfs',
      '/tmp',
      '--cap-drop',
      'ALL',
      '--pids-limit',
      '256',
      '--memory',
      `${this.options.memoryMb}m`,
      '--cpus',
      String(this.options.cpus),
      '--user',
      'node',
      '--workdir',
      '/pkg',
      '-v',
      `${this.options.packageDir}:/pkg:ro`,
      '-v',
      `${this.instrumentationDir}:/verifier-core:ro`,
    ];

    args.push('--network', this.options.networkEnabled ? 'bridge' : 'none');
    args.push(this.options.image, 'sleep', 'infinity');

    const result = await runCommand('docker', args, this.options.execTimeoutMs);
    if (result.exitCode !== 0 || !result.stdout.trim()) {
      throw new Error(`Failed to start Docker sandbox: ${result.stderr || result.stdout}`);
    }

    this.containerId = result.stdout.trim();
  }

  async exec(command: string[], env: Record<string, string> = {}): Promise<SandboxExecResult> {
    if (!this.containerId) {
      throw new Error('Sandbox not started.');
    }

    const args = ['exec'];
    for (const [key, value] of Object.entries(env)) {
      args.push('-e', `${key}=${value}`);
    }
    args.push(this.containerId, ...command);

    return await runCommand('docker', args, this.options.execTimeoutMs);
  }

  async stop(): Promise<void> {
    if (this.containerId) {
      await runCommand('docker', ['rm', '-f', this.containerId], this.options.execTimeoutMs).catch(() => undefined);
      this.containerId = null;
    }

    if (this.instrumentationDir) {
      await fs.rm(this.instrumentationDir, { recursive: true, force: true });
      this.instrumentationDir = null;
    }
  }
}
