import test from "node:test";
import assert from "node:assert/strict";

import { buildTimerAdvanceJs, INSTRUMENTATION_JS } from "../../src/sandbox/instrumentation.ts";

test("INSTRUMENTATION_JS patches module resolution and file system access", () => {
  assert.match(INSTRUMENTATION_JS, /Module\._resolveFilename/);
  assert.match(INSTRUMENTATION_JS, /type: 'require'/);
  assert.match(INSTRUMENTATION_JS, /type: 'fs'/);
  assert.match(INSTRUMENTATION_JS, /readFileSync/);
  assert.match(INSTRUMENTATION_JS, /writeFileSync/);
});

test("INSTRUMENTATION_JS patches network, process, env, eval, crypto, and timers", () => {
  assert.match(INSTRUMENTATION_JS, /type: 'network'/);
  assert.match(INSTRUMENTATION_JS, /type: 'process'/);
  assert.match(INSTRUMENTATION_JS, /type: 'env'/);
  assert.match(INSTRUMENTATION_JS, /type: 'eval'/);
  assert.match(INSTRUMENTATION_JS, /type: 'crypto'/);
  assert.match(INSTRUMENTATION_JS, /type: 'timer'/);
});

test("INSTRUMENTATION_JS flushes a serialized trace on process exit", () => {
  assert.match(INSTRUMENTATION_JS, /__NPMGUARD_TRACE__/);
  assert.match(INSTRUMENTATION_JS, /__NPMGUARD_TRACE_END__/);
  assert.match(INSTRUMENTATION_JS, /process\.on\('exit'/);
});

test("buildTimerAdvanceJs injects the requested entrypoint and timer advance", () => {
  const script = buildTimerAdvanceJs("index.js", 5000);

  assert.match(script, /require\("\.\/index\.js"\);/);
  assert.match(script, /clock\.tick\(5000\);/);
  assert.match(script, /createClock/);
});

test("buildTimerAdvanceJs coerces advanceMs to a number", () => {
  const script = buildTimerAdvanceJs("worker.js", Number("250"));

  assert.match(script, /clock\.tick\(250\);/);
});
