/** JS instrumentation module — monkey-patches sensitive Node.js APIs.
 *  Injected via `node --require /tmp/_instrument.js <entrypoint>`.
 *  This is runtime JS, NOT TypeScript — kept as a string constant. */

export const INSTRUMENTATION_JS = String.raw`
'use strict';

const _log = [];
const _originals = {};

// --- Module loading ---
const Module = require('module');
const _origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) {
  _log.push({ type: 'require', module: request, from: parent?.filename || '<root>' });
  return _origResolve.call(this, request, parent, ...rest);
};

// --- Filesystem ---
const fs = require('fs');
for (const method of ['readFileSync', 'writeFileSync', 'readFile', 'writeFile', 'accessSync', 'statSync']) {
  if (typeof fs[method] === 'function') {
    _originals['fs.' + method] = fs[method];
    fs[method] = function(path, ...args) {
      _log.push({ type: 'fs', method, path: String(path) });
      return _originals['fs.' + method].call(this, path, ...args);
    };
  }
}

// --- Network ---
for (const proto of ['http', 'https']) {
  try {
    const mod = require(proto);
    const _origRequest = mod.request;
    mod.request = function(options, ...args) {
      const url = typeof options === 'string' ? options : proto + '://' + (options.hostname || options.host) + (options.path || '/');
      _log.push({ type: 'network', method: options.method || 'GET', url });
      return _origRequest.call(this, options, ...args);
    };
  } catch {}
}

// --- Process spawning ---
const cp = require('child_process');
for (const method of ['exec', 'execSync', 'spawn', 'spawnSync', 'fork']) {
  if (typeof cp[method] === 'function') {
    _originals['cp.' + method] = cp[method];
    cp[method] = function(cmd, ...args) {
      _log.push({ type: 'process', method, cmd: String(cmd) });
      return _originals['cp.' + method].call(this, cmd, ...args);
    };
  }
}

// --- Environment access ---
const _envHandler = {
  get(target, prop, receiver) {
    if (typeof prop === 'string' && prop !== 'toJSON' && !prop.startsWith('_')) {
      _log.push({ type: 'env', key: prop });
    }
    return Reflect.get(target, prop, receiver);
  }
};
process.env = new Proxy(process.env, _envHandler);

// --- Dynamic code execution ---
const _origEval = global.eval;
global.eval = function(code) {
  _log.push({ type: 'eval', code: String(code).slice(0, 200) });
  return _origEval.call(this, code);
};

// --- Crypto ---
try {
  const crypto = require('crypto');
  for (const method of ['createDecipheriv', 'createDecipher', 'createCipheriv', 'createHash']) {
    if (typeof crypto[method] === 'function') {
      _originals['crypto.' + method] = crypto[method];
      crypto[method] = function(algo, ...args) {
        _log.push({ type: 'crypto', method, algo: String(algo) });
        return _originals['crypto.' + method].call(this, algo, ...args);
      };
    }
  }
} catch {}

// --- Timers ---
const _origSetTimeout = global.setTimeout;
const _origSetInterval = global.setInterval;
global.setTimeout = function(fn, ms, ...args) {
  _log.push({ type: 'timer', kind: 'setTimeout', ms });
  return _origSetTimeout.call(this, fn, ms, ...args);
};
global.setInterval = function(fn, ms, ...args) {
  _log.push({ type: 'timer', kind: 'setInterval', ms });
  return _origSetInterval.call(this, fn, ms, ...args);
};

// --- Flush on exit ---
process.on('exit', () => {
  try {
    process.stdout.write('\n__NPMGUARD_TRACE__' + JSON.stringify(_log) + '__NPMGUARD_TRACE_END__\n');
  } catch {}
});
`;

/** Timer-advancing wrapper using @sinonjs/fake-timers. */
export function buildTimerAdvanceJs(entrypoint: string, advanceMs: number): string {
  const safeEntrypoint = JSON.stringify("./" + entrypoint);
  const safeMs = Number(advanceMs);
  return `
'use strict';
const { createClock } = require('@sinonjs/fake-timers');
const clock = createClock();

global.setTimeout = clock.setTimeout;
global.setInterval = clock.setInterval;
global.clearTimeout = clock.clearTimeout;
global.clearInterval = clock.clearInterval;
global.Date = clock.Date;

require(${safeEntrypoint});

clock.tick(${safeMs});

setTimeout(() => process.exit(0), 100);
`;
}
