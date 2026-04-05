import test from 'node:test';
import assert from 'node:assert/strict';

import { readOpenClawEnv } from '../../src/env.ts';
import { withPatchedEnv } from '../helpers/env.ts';

test('readOpenClawEnv returns documented defaults when env is unset', () => {
  const env = withPatchedEnv(
    {
      OPENCLAW_CMD: undefined,
      OPENCLAW_ARGS: undefined,
      OPENCLAW_MAX_TURNS: undefined,
      OPENCLAW_RESET_BEFORE_RUN: undefined,
      OPENCLAW_RESET_SESSION_KEY: undefined,
    },
    () => readOpenClawEnv(),
  );

  assert.equal(env.command, 'openclaw');
  assert.deepEqual(env.args, ['--local', '--json', '--agent', 'verifier']);
  assert.equal(env.maxTurns, 16);
  assert.equal(env.resetBeforeRun, false);
  assert.equal(env.resetSessionKey, 'agent:verifier:main');
});

test('readOpenClawEnv uses explicit command and args overrides', () => {
  const env = withPatchedEnv(
    {
      OPENCLAW_CMD: '/tmp/docker-openclaw.sh',
      OPENCLAW_ARGS: '--json --agent main --thinking high',
      OPENCLAW_MAX_TURNS: '8',
    },
    () => readOpenClawEnv(),
  );

  assert.equal(env.command, '/tmp/docker-openclaw.sh');
  assert.deepEqual(env.args, ['--json', '--agent', 'main', '--thinking', 'high']);
  assert.equal(env.maxTurns, 8);
});

test('readOpenClawEnv derives resetSessionKey from agent id when present', () => {
  const env = withPatchedEnv(
    {
      OPENCLAW_ARGS: '--local --json --agent main',
      OPENCLAW_RESET_SESSION_KEY: undefined,
    },
    () => readOpenClawEnv(),
  );

  assert.equal(env.resetSessionKey, 'agent:main:main');
});

test('readOpenClawEnv leaves resetSessionKey undefined when no agent is present', () => {
  const env = withPatchedEnv(
    {
      OPENCLAW_ARGS: '--local --json --session-id abc123',
      OPENCLAW_RESET_SESSION_KEY: undefined,
    },
    () => readOpenClawEnv(),
  );

  assert.equal(env.resetSessionKey, undefined);
});

test('readOpenClawEnv respects an explicit reset session key', () => {
  const env = withPatchedEnv(
    {
      OPENCLAW_ARGS: '--json --agent main',
      OPENCLAW_RESET_SESSION_KEY: 'custom:session:key',
    },
    () => readOpenClawEnv(),
  );

  assert.equal(env.resetSessionKey, 'custom:session:key');
});

test('readOpenClawEnv defaults resetBeforeRun to true when not using --local', () => {
  const env = withPatchedEnv(
    {
      OPENCLAW_ARGS: '--json --agent main',
      OPENCLAW_RESET_BEFORE_RUN: undefined,
    },
    () => readOpenClawEnv(),
  );

  assert.equal(env.resetBeforeRun, true);
});

test('readOpenClawEnv parses truthy reset flags', () => {
  for (const value of ['1', 'true', 'TRUE', 'yes', 'on']) {
    const env = withPatchedEnv(
      {
        OPENCLAW_ARGS: '--local --json --agent main',
        OPENCLAW_RESET_BEFORE_RUN: value,
      },
      () => readOpenClawEnv(),
    );

    assert.equal(env.resetBeforeRun, true);
  }
});

test('readOpenClawEnv parses falsy reset flags', () => {
  for (const value of ['0', 'false', 'FALSE', 'no', 'off']) {
    const env = withPatchedEnv(
      {
        OPENCLAW_ARGS: '--json --agent main',
        OPENCLAW_RESET_BEFORE_RUN: value,
      },
      () => readOpenClawEnv(),
    );

    assert.equal(env.resetBeforeRun, false);
  }
});

test('readOpenClawEnv ignores unrecognized reset flag values', () => {
  const env = withPatchedEnv(
    {
      OPENCLAW_ARGS: '--json --agent main',
      OPENCLAW_RESET_BEFORE_RUN: 'sometimes',
    },
    () => readOpenClawEnv(),
  );

  assert.equal(env.resetBeforeRun, true);
});

test('readOpenClawEnv supports --agent=value style flags', () => {
  const env = withPatchedEnv(
    {
      OPENCLAW_ARGS: '--local --json --agent=worker',
      OPENCLAW_RESET_SESSION_KEY: undefined,
    },
    () => readOpenClawEnv(),
  );

  assert.deepEqual(env.args, ['--local', '--json', '--agent=worker']);
  assert.equal(env.resetSessionKey, 'agent:worker:main');
});

test('readOpenClawEnv tolerates missing values after flags', () => {
  const env = withPatchedEnv(
    {
      OPENCLAW_ARGS: '--local --json --agent',
      OPENCLAW_RESET_SESSION_KEY: undefined,
    },
    () => readOpenClawEnv(),
  );

  assert.equal(env.resetSessionKey, undefined);
});

test('readOpenClawEnv trims whitespace around command and args', () => {
  const env = withPatchedEnv(
    {
      OPENCLAW_CMD: '  openclaw  ',
      OPENCLAW_ARGS: '   --local   --json   --agent   verifier   ',
    },
    () => readOpenClawEnv(),
  );

  assert.equal(env.command, 'openclaw');
  assert.deepEqual(env.args, ['--local', '--json', '--agent', 'verifier']);
});
