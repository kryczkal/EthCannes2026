import path from 'node:path';

import { DockerSandbox, type SandboxExecResult } from './docker.js';
import { listPackageFiles, readPackageFile, searchInPackageFiles } from './fs-tools.js';
import type { ToolName, VerificationInput } from './schemas.js';
import { truncateText } from './text.js';

export interface VerifierToolRuntimeOptions {
  input: VerificationInput;
  sandbox: DockerSandbox;
}

function formatExecResult(result: SandboxExecResult): string {
  return JSON.stringify(
    {
      exit_code: result.exitCode,
      timed_out: result.timedOut,
      stdout: result.stdout,
      stderr: result.stderr,
    },
    null,
    2,
  );
}

function buildRequireScript(target: string): string {
  return `
const path = require('node:path');
const trace = globalThis.__VERIFIER_TRACE__;
trace.reset();
const target = path.resolve('/pkg', process.argv[1]);
try {
  require(target);
  console.log(JSON.stringify({ ok: true, trace: trace.flush() }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: String(error), trace: trace.flush() }, null, 2));
  process.exitCode = 1;
}
`;
}

function buildFastForwardScript(target: string, advanceMs: number): string {
  return `
const path = require('node:path');
const trace = globalThis.__VERIFIER_TRACE__;
trace.reset();
const jobs = [];
global.setTimeout = (fn, ms = 0, ...args) => {
  jobs.push({ ms: Number(ms) || 0, run: () => fn(...args) });
  return jobs.length;
};
global.setInterval = (fn, ms = 0, ...args) => {
  jobs.push({ ms: Number(ms) || 0, run: () => fn(...args) });
  return jobs.length;
};
const target = path.resolve('/pkg', process.argv[1]);
const advance = Number(process.argv[2]) || 0;
try {
  require(target);
  for (const job of jobs.filter((entry) => entry.ms <= advance)) {
    try {
      job.run();
    } catch (error) {
      console.error(String(error));
    }
  }
  console.log(JSON.stringify({ ok: true, trace: trace.flush(), advanced_ms: advance }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: String(error), trace: trace.flush(), advanced_ms: advance }, null, 2));
  process.exitCode = 1;
}
`;
}

export class VerifierToolRuntime {
  readonly input: VerificationInput;

  readonly sandbox: DockerSandbox;

  readonly toolTrace: string[] = [];

  constructor(options: VerifierToolRuntimeOptions) {
    this.input = options.input;
    this.sandbox = options.sandbox;
  }

  private trace<T>(name: ToolName, detail: string, fn: () => Promise<T>): Promise<T> {
    this.toolTrace.push(`${name}(${detail})`);
    return fn();
  }

  async list_files(): Promise<string> {
    return await this.trace('list_files', '', async () =>
      JSON.stringify(await listPackageFiles(this.input.package_dir), null, 2),
    );
  }

  async read_file(filePath: string): Promise<string> {
    return await this.trace('read_file', filePath, async () =>
      await readPackageFile(this.input.package_dir, filePath),
    );
  }

  async search_in_files(pattern: string): Promise<string> {
    return await this.trace('search_in_files', pattern, async () =>
      JSON.stringify(await searchInPackageFiles(this.input.package_dir, pattern), null, 2),
    );
  }

  async eval_js(code: string): Promise<string> {
    return await this.trace('eval_js', truncateText(code, 120), async () => {
      const result = await this.sandbox.exec(['node', '-e', code]);
      return formatExecResult(result);
    });
  }

  async require_and_trace(entrypointOrFile: string): Promise<string> {
    return await this.trace('require_and_trace', entrypointOrFile, async () => {
      const script = buildRequireScript(entrypointOrFile);
      const result = await this.sandbox.exec([
        'node',
        '--require',
        '/verifier-core/instrumentation.cjs',
        '-e',
        script,
        entrypointOrFile,
      ]);
      return formatExecResult(result);
    });
  }

  async run_npm_script(scriptName: string): Promise<string> {
    return await this.trace('run_npm_script', scriptName, async () => {
      const result = await this.sandbox.exec(['npm', 'run', scriptName, '--if-present'], {
        NODE_OPTIONS: '--require /verifier-core/instrumentation.cjs',
      });
      return formatExecResult(result);
    });
  }

  async fast_forward_timers(entrypointOrFile: string, advanceMs: number): Promise<string> {
    return await this.trace('fast_forward_timers', `${entrypointOrFile}, ${advanceMs}`, async () => {
      const script = buildFastForwardScript(entrypointOrFile, advanceMs);
      const result = await this.sandbox.exec([
        'node',
        '--require',
        '/verifier-core/instrumentation.cjs',
        '-e',
        script,
        entrypointOrFile,
        String(advanceMs),
      ]);
      return formatExecResult(result);
    });
  }

  snapshotTrace(): string[] {
    return [...this.toolTrace];
  }
}

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  list_files: 'List package files with size and type.',
  read_file: 'Read a text file from the package root.',
  search_in_files: 'Search text files in the package by regex pattern.',
  eval_js: 'Execute a small JavaScript snippet inside the sandbox.',
  require_and_trace: 'Require a package file in Docker with instrumentation enabled and return trace JSON.',
  run_npm_script: 'Run one npm script with instrumentation enabled in Docker.',
  fast_forward_timers: 'Load a file in Docker, fake timers, and advance them to trigger delayed payloads.',
};

export function defaultEntrypointForCandidate(input: VerificationInput, filePath: string): string {
  return path.posix.normalize(filePath.replace(/\\/g, '/'));
}
