import test from 'node:test';
import assert from 'node:assert/strict';

import { OpenClawToolRuntime, TOOL_DESCRIPTIONS } from '../../src/tools.ts';
import { createPackageFixture } from '../helpers/package-fixture.ts';

class FakeSandbox {
  readonly calls: Array<{ command: string[]; env: Record<string, string> }> = [];

  async exec(command: string[], env: Record<string, string> = {}) {
    this.calls.push({ command, env });
    return {
      command,
      stdout: 'sandbox stdout',
      stderr: 'sandbox stderr',
      exitCode: 0,
      timedOut: false,
    };
  }
}

async function makeRuntime() {
  const fixture = await createPackageFixture();
  const sandbox = new FakeSandbox();
  const runtime = new OpenClawToolRuntime(
    {
      package_dir: fixture.packageDir,
      package_name: 'fixture-pkg',
      package_version: '1.0.0',
      candidates: [
        {
          id: 'cand-001',
          file_name: 'lib/telemetry.js',
          where: '1-20',
          potential_vulnerability: 'Reads environment variables and exfiltrates them over HTTP',
        },
      ],
    },
    sandbox as never,
  );

  return { fixture, sandbox, runtime };
}

test('TOOL_DESCRIPTIONS exposes the bounded tool surface', () => {
  assert.deepEqual(Object.keys(TOOL_DESCRIPTIONS), [
    'list_files',
    'read_file',
    'search_in_files',
    'eval_js',
    'require_and_trace',
    'run_npm_script',
    'fast_forward_timers',
  ]);
});

test('listFiles returns serialized package metadata and traces the call', async (t) => {
  const { fixture, runtime } = await makeRuntime();
  t.after(async () => {
    await fixture.cleanup();
  });

  const output = await runtime.listFiles();
  const parsed = JSON.parse(output) as Array<{ path: string; type: string }>;

  assert.ok(parsed.some((entry) => entry.path === 'lib/telemetry.js' && entry.type === 'file'));
  assert.ok(parsed.some((entry) => entry.path === 'scripts' && entry.type === 'dir'));
  assert.deepEqual(runtime.toolTrace, ['list_files()']);
});

test('readFile returns source content and appends a trace entry', async (t) => {
  const { fixture, runtime } = await makeRuntime();
  t.after(async () => {
    await fixture.cleanup();
  });

  const output = await runtime.readFile('lib/telemetry.js');
  assert.match(output, /process\.env\.NPM_TOKEN/);
  assert.deepEqual(runtime.toolTrace, ['read_file(lib/telemetry.js)']);
});

test('searchInFiles returns JSON and records the regex pattern', async (t) => {
  const { fixture, runtime } = await makeRuntime();
  t.after(async () => {
    await fixture.cleanup();
  });

  const output = await runtime.searchInFiles('fetch');
  const parsed = JSON.parse(output) as Array<{ file: string; line: number; excerpt: string }>;

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.file, 'lib/telemetry.js');
  assert.deepEqual(runtime.toolTrace, ['search_in_files(fetch)']);
});

test('evalJs executes node -e inside the sandbox and formats the exec result', async (t) => {
  const { fixture, sandbox, runtime } = await makeRuntime();
  t.after(async () => {
    await fixture.cleanup();
  });

  const output = await runtime.evalJs('console.log("hello")');
  const parsed = JSON.parse(output) as { exit_code: number; stdout: string; stderr: string; timed_out: boolean };

  assert.deepEqual(sandbox.calls[0], {
    command: ['node', '-e', 'console.log("hello")'],
    env: {},
  });
  assert.equal(parsed.exit_code, 0);
  assert.equal(parsed.stdout, 'sandbox stdout');
  assert.equal(parsed.timed_out, false);
  assert.deepEqual(runtime.toolTrace, ['eval_js(console.log("hello"))']);
});

test('evalJs truncates long code snippets in the tool trace detail', async (t) => {
  const { fixture, runtime } = await makeRuntime();
  t.after(async () => {
    await fixture.cleanup();
  });

  const longCode = 'x'.repeat(200);
  await runtime.evalJs(longCode);

  assert.match(runtime.toolTrace[0] ?? '', /^eval_js\(x{120}\n\.\.\.\[truncated 80 chars\]\)$/);
});

test('requireAndTrace uses the verifier preload and passes the target file as an argument', async (t) => {
  const { fixture, sandbox, runtime } = await makeRuntime();
  t.after(async () => {
    await fixture.cleanup();
  });

  const output = await runtime.requireAndTrace('lib/telemetry.js');
  const parsed = JSON.parse(output) as { exit_code: number; stdout: string };
  const call = sandbox.calls[0];

  assert.ok(call);
  assert.equal(call?.command[0], 'node');
  assert.equal(call?.command[1], '--require');
  assert.equal(call?.command[2], '/verifier/instrumentation.cjs');
  assert.equal(call?.command.at(-1), 'lib/telemetry.js');
  assert.equal(parsed.exit_code, 0);
  assert.deepEqual(runtime.toolTrace, ['require_and_trace(lib/telemetry.js)']);
});

test('runNpmScript injects NODE_OPTIONS and calls npm run --if-present', async (t) => {
  const { fixture, sandbox, runtime } = await makeRuntime();
  t.after(async () => {
    await fixture.cleanup();
  });

  const output = await runtime.runNpmScript('postinstall');
  const parsed = JSON.parse(output) as { exit_code: number };

  assert.deepEqual(sandbox.calls[0], {
    command: ['npm', 'run', 'postinstall', '--if-present'],
    env: {
      NODE_OPTIONS: '--require /verifier/instrumentation.cjs',
    },
  });
  assert.equal(parsed.exit_code, 0);
  assert.deepEqual(runtime.toolTrace, ['run_npm_script(postinstall)']);
});

test('fastForwardTimers passes entrypoint and advanceMs through to node', async (t) => {
  const { fixture, sandbox, runtime } = await makeRuntime();
  t.after(async () => {
    await fixture.cleanup();
  });

  const output = await runtime.fastForwardTimers('index.js', 5000);
  const parsed = JSON.parse(output) as { exit_code: number };
  const call = sandbox.calls[0];

  assert.ok(call);
  assert.equal(call?.command[0], 'node');
  assert.equal(call?.command[1], '--require');
  assert.equal(call?.command[2], '/verifier/instrumentation.cjs');
  assert.equal(call?.command.at(-2), 'index.js');
  assert.equal(call?.command.at(-1), '5000');
  assert.equal(parsed.exit_code, 0);
  assert.deepEqual(runtime.toolTrace, ['fast_forward_timers(index.js, 5000)']);
});

test('tool runtime accumulates trace entries across multiple calls', async (t) => {
  const { fixture, runtime } = await makeRuntime();
  t.after(async () => {
    await fixture.cleanup();
  });

  await runtime.readFile('lib/telemetry.js');
  await runtime.searchInFiles('fetch');
  await runtime.evalJs('console.log("done")');

  assert.deepEqual(runtime.toolTrace, [
    'read_file(lib/telemetry.js)',
    'search_in_files(fetch)',
    'eval_js(console.log("done"))',
  ]);
});
