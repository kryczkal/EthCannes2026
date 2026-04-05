import test from 'node:test';
import assert from 'node:assert/strict';

import { INSTRUMENTATION_SCRIPT } from '../../src/instrumentation.ts';

test('instrumentation script defines the global verifier trace object', () => {
  assert.match(INSTRUMENTATION_SCRIPT, /__OPENCLAW_VERIFIER_TRACE__/);
  assert.match(INSTRUMENTATION_SCRIPT, /flush\(\)/);
  assert.match(INSTRUMENTATION_SCRIPT, /reset\(\)/);
});

test('instrumentation script tracks module loading', () => {
  assert.match(INSTRUMENTATION_SCRIPT, /modules_loaded/);
  assert.match(INSTRUMENTATION_SCRIPT, /Module\._load/);
  assert.match(INSTRUMENTATION_SCRIPT, /record\.module/);
});

test('instrumentation script patches filesystem operations', () => {
  assert.match(INSTRUMENTATION_SCRIPT, /fs_operations/);
  assert.match(INSTRUMENTATION_SCRIPT, /readFileSync/);
  assert.match(INSTRUMENTATION_SCRIPT, /writeFileSync/);
  assert.match(INSTRUMENTATION_SCRIPT, /appendFileSync/);
  assert.match(INSTRUMENTATION_SCRIPT, /fsp/);
});

test('instrumentation script proxies process.env access', () => {
  assert.match(INSTRUMENTATION_SCRIPT, /env_access/);
  assert.match(INSTRUMENTATION_SCRIPT, /process\.env = new Proxy/);
  assert.match(INSTRUMENTATION_SCRIPT, /record\.env/);
});

test('instrumentation script patches http, https, and net calls', () => {
  assert.match(INSTRUMENTATION_SCRIPT, /network_calls/);
  assert.match(INSTRUMENTATION_SCRIPT, /patchRequest\(http/);
  assert.match(INSTRUMENTATION_SCRIPT, /patchRequest\(https/);
  assert.match(INSTRUMENTATION_SCRIPT, /net\.connect/);
});

test('instrumentation script records child process spawns', () => {
  assert.match(INSTRUMENTATION_SCRIPT, /process_spawns/);
  assert.match(INSTRUMENTATION_SCRIPT, /\['spawn', 'exec', 'execFile', 'fork'\]/);
  assert.match(INSTRUMENTATION_SCRIPT, /record\.spawn/);
});

test('instrumentation script records eval and Function usage', () => {
  assert.match(INSTRUMENTATION_SCRIPT, /eval_calls/);
  assert.match(INSTRUMENTATION_SCRIPT, /global\.eval/);
  assert.match(INSTRUMENTATION_SCRIPT, /global\.Function/);
});

test('instrumentation script records timers', () => {
  assert.match(INSTRUMENTATION_SCRIPT, /timers/);
  assert.match(INSTRUMENTATION_SCRIPT, /setTimeout/);
  assert.match(INSTRUMENTATION_SCRIPT, /setInterval/);
  assert.match(INSTRUMENTATION_SCRIPT, /record\.timer/);
});

test('instrumentation script truncates previews to avoid giant payloads', () => {
  assert.match(INSTRUMENTATION_SCRIPT, /raw\.length > 200/);
  assert.match(INSTRUMENTATION_SCRIPT, /raw\.slice\(0, 200\)/);
});
