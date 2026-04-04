import type { ToolSet } from 'ai';
import { tool } from 'ai';
import { z } from 'zod';

import { DockerSandbox } from './docker.js';
import { listPackageFiles, readPackageFile, searchInPackageFiles } from './fs-tools.js';
import type { VerificationInput } from './schemas.js';
import { truncateText } from './text.js';

function formatExecResult(result: Awaited<ReturnType<DockerSandbox['exec']>>): string {
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

export class AISDKToolRuntime {
  readonly toolTrace: string[] = [];

  constructor(readonly input: VerificationInput, readonly sandbox: DockerSandbox) {}

  private trace<T>(name: string, detail: string, fn: () => Promise<T>): Promise<T> {
    this.toolTrace.push(`${name}(${detail})`);
    return fn();
  }

  async listFiles() {
    return await this.trace('list_files', '', async () =>
      JSON.stringify(await listPackageFiles(this.input.package_dir), null, 2),
    );
  }

  async readFile(filePath: string) {
    return await this.trace('read_file', filePath, async () =>
      await readPackageFile(this.input.package_dir, filePath),
    );
  }

  async searchInFiles(pattern: string) {
    return await this.trace('search_in_files', pattern, async () =>
      JSON.stringify(await searchInPackageFiles(this.input.package_dir, pattern), null, 2),
    );
  }

  async evalJs(code: string) {
    return await this.trace('eval_js', truncateText(code, 120), async () =>
      formatExecResult(await this.sandbox.exec(['node', '-e', code])),
    );
  }

  async requireAndTrace(entrypointOrFile: string) {
    return await this.trace('require_and_trace', entrypointOrFile, async () => {
      const script = `
const path = require('node:path');
const trace = globalThis.__AI_SDK_VERIFIER_TRACE__;
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
      return formatExecResult(
        await this.sandbox.exec(['node', '--require', '/verifier/instrumentation.cjs', '-e', script, entrypointOrFile]),
      );
    });
  }

  async runNpmScript(scriptName: string) {
    return await this.trace('run_npm_script', scriptName, async () =>
      formatExecResult(
        await this.sandbox.exec(['npm', 'run', scriptName, '--if-present'], {
          NODE_OPTIONS: '--require /verifier/instrumentation.cjs',
        }),
      ),
    );
  }

  async fastForwardTimers(entrypointOrFile: string, advanceMs: number) {
    return await this.trace('fast_forward_timers', `${entrypointOrFile}, ${advanceMs}`, async () => {
      const script = `
const path = require('node:path');
const trace = globalThis.__AI_SDK_VERIFIER_TRACE__;
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
    try { job.run(); } catch (error) { console.error(String(error)); }
  }
  console.log(JSON.stringify({ ok: true, trace: trace.flush(), advanced_ms: advance }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: String(error), trace: trace.flush(), advanced_ms: advance }, null, 2));
  process.exitCode = 1;
}
`;
      return formatExecResult(
        await this.sandbox.exec(
          ['node', '--require', '/verifier/instrumentation.cjs', '-e', script, entrypointOrFile, String(advanceMs)],
        ),
      );
    });
  }
}

export function buildAISDKTools(runtime: AISDKToolRuntime): ToolSet {
  return {
    list_files: tool({
      description: 'List package files with size and type.',
      inputSchema: z.object({}),
      execute: async () => await runtime.listFiles(),
    }),
    read_file: tool({
      description: 'Read a text file from the package.',
      inputSchema: z.object({ filePath: z.string().min(1) }),
      execute: async ({ filePath }) => await runtime.readFile(filePath),
    }),
    search_in_files: tool({
      description: 'Search package text files using a regex pattern.',
      inputSchema: z.object({ pattern: z.string().min(1) }),
      execute: async ({ pattern }) => await runtime.searchInFiles(pattern),
    }),
    eval_js: tool({
      description: 'Execute a JavaScript snippet inside Docker.',
      inputSchema: z.object({ code: z.string().min(1) }),
      execute: async ({ code }) => await runtime.evalJs(code),
    }),
    require_and_trace: tool({
      description: 'Require a package file with instrumentation enabled and return trace JSON.',
      inputSchema: z.object({ entrypointOrFile: z.string().min(1) }),
      execute: async ({ entrypointOrFile }) => await runtime.requireAndTrace(entrypointOrFile),
    }),
    run_npm_script: tool({
      description: 'Run one npm script with instrumentation enabled.',
      inputSchema: z.object({ scriptName: z.string().min(1) }),
      execute: async ({ scriptName }) => await runtime.runNpmScript(scriptName),
    }),
    fast_forward_timers: tool({
      description: 'Load a file and advance fake timers to trigger delayed behavior.',
      inputSchema: z.object({ entrypointOrFile: z.string().min(1), advanceMs: z.number().int().nonnegative() }),
      execute: async ({ entrypointOrFile, advanceMs }) => await runtime.fastForwardTimers(entrypointOrFile, advanceMs),
    }),
  };
}
