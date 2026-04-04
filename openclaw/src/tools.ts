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

export class OpenClawToolRuntime {
  readonly toolTrace: string[] = [];

  constructor(readonly input: VerificationInput, readonly sandbox: DockerSandbox) {}

  private trace<T>(name: string, detail: string, fn: () => Promise<T>): Promise<T> {
    this.toolTrace.push(`${name}(${detail})`);
    return fn();
  }

  async listFiles() {
    return await this.trace('list_files', '', async () => JSON.stringify(await listPackageFiles(this.input.package_dir), null, 2));
  }

  async readFile(filePath: string) {
    return await this.trace('read_file', filePath, async () => await readPackageFile(this.input.package_dir, filePath));
  }

  async searchInFiles(pattern: string) {
    return await this.trace('search_in_files', pattern, async () => JSON.stringify(await searchInPackageFiles(this.input.package_dir, pattern), null, 2));
  }

  async evalJs(code: string) {
    return await this.trace('eval_js', truncateText(code, 120), async () => formatExecResult(await this.sandbox.exec(['node', '-e', code])));
  }

  async requireAndTrace(entrypointOrFile: string) {
    return await this.trace('require_and_trace', entrypointOrFile, async () => {
      const script = `
const path = require('node:path');
const trace = globalThis.__OPENCLAW_VERIFIER_TRACE__;
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
      return formatExecResult(await this.sandbox.exec(['node', '--require', '/verifier/instrumentation.cjs', '-e', script, entrypointOrFile]));
    });
  }

  async runNpmScript(scriptName: string) {
    return await this.trace('run_npm_script', scriptName, async () =>
      formatExecResult(await this.sandbox.exec(['npm', 'run', scriptName, '--if-present'], { NODE_OPTIONS: '--require /verifier/instrumentation.cjs' })),
    );
  }

  async fastForwardTimers(entrypointOrFile: string, advanceMs: number) {
    return await this.trace('fast_forward_timers', `${entrypointOrFile}, ${advanceMs}`, async () => {
      const script = `
const path = require('node:path');
const trace = globalThis.__OPENCLAW_VERIFIER_TRACE__;
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
      return formatExecResult(await this.sandbox.exec(['node', '--require', '/verifier/instrumentation.cjs', '-e', script, entrypointOrFile, String(advanceMs)]));
    });
  }
}

export const TOOL_DESCRIPTIONS = {
  list_files: 'List package files with size and type.',
  read_file: 'Read a text file from the package.',
  search_in_files: 'Search package text files using a regex pattern.',
  eval_js: 'Execute a JavaScript snippet inside Docker.',
  require_and_trace: 'Require a package file with instrumentation enabled and return trace JSON.',
  run_npm_script: 'Run one npm script with instrumentation enabled.',
  fast_forward_timers: 'Load a file and advance fake timers to trigger delayed behavior.',
} as const;
