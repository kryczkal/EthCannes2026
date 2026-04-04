import { spawn } from 'node:child_process';

export interface OpenClawClientOptions {
  command: string;
  args: string[];
  sessionId?: string;
}

function getPayloadText(value: unknown): string | null {
  return Array.isArray(value) &&
    typeof value[0] === 'object' &&
    value[0] !== null &&
    typeof (value[0] as { text?: unknown }).text === 'string'
    ? (value[0] as { text: string }).text
    : null;
}

function extractResponseText(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('OpenClaw returned an empty response.');
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const result = typeof parsed.result === 'object' && parsed.result !== null
      ? (parsed.result as Record<string, unknown>)
      : null;
    const payloadText = getPayloadText(parsed.payloads) || getPayloadText(result?.payloads);
    const text =
      payloadText ||
      (typeof result?.output === 'string' && result.output) ||
      (typeof result?.text === 'string' && result.text) ||
      (typeof result?.message === 'string' && result.message) ||
      (typeof result?.response === 'string' && result.response) ||
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
      const commandArgs = ['agent', ...this.options.args];
      if (this.options.sessionId) {
        commandArgs.push('--session-id', this.options.sessionId);
      }
      commandArgs.push('--message', prompt);

      const child = spawn(this.options.command, commandArgs, {
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
