import { spawn } from 'node:child_process';

export interface OpenClawClientOptions {
  command: string;
  args: string[];
}

function extractResponseText(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('OpenClaw returned an empty response.');
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const text =
      (typeof parsed.output === 'string' && parsed.output) ||
      (typeof parsed.text === 'string' && parsed.text) ||
      (typeof parsed.message === 'string' && parsed.message) ||
      (typeof parsed.response === 'string' && parsed.response);

    if (text) {
      return text;
    }
  } catch {
    // fall back to raw stdout
  }

  return trimmed;
}

export class OpenClawClient {
  private readonly options: OpenClawClientOptions;

  constructor(options: OpenClawClientOptions) {
    this.options = options;
  }

  async complete(prompt: string): Promise<string> {
    return await new Promise((resolve, reject) => {
      const child = spawn(this.options.command, ['agent', ...this.options.args, '--message', prompt], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`OpenClaw exited with code ${code}: ${stderr || stdout}`));
          return;
        }

        resolve(extractResponseText(stdout));
      });
    });
  }
}
