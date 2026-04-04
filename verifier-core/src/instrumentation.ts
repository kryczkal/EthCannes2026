export const INSTRUMENTATION_SCRIPT = `
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const childProcess = require('node:child_process');
const Module = require('node:module');

if (!globalThis.__VERIFIER_TRACE__) {
  const trace = {
    modules_loaded: [],
    network_calls: [],
    fs_operations: [],
    env_access: [],
    process_spawns: [],
    eval_calls: [],
    timers: [],
  };

  const preview = (value) => {
    if (value == null) return '';
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    return raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
  };

  const record = {
    module(id) {
      trace.modules_loaded.push(String(id));
    },
    network(method, url, bodyPreview = '') {
      trace.network_calls.push({ method, url, body_preview: preview(bodyPreview) });
    },
    fs(op, targetPath, value = '') {
      trace.fs_operations.push({ op, path: String(targetPath), preview: preview(value) });
    },
    env(key) {
      trace.env_access.push(String(key));
    },
    spawn(cmd, args = []) {
      trace.process_spawns.push({ cmd: String(cmd), args: args.map((arg) => String(arg)) });
    },
    eval(code) {
      trace.eval_calls.push({ code: preview(code) });
    },
    timer(type, ms, source = '') {
      trace.timers.push({ type, ms: Number(ms) || 0, source });
    },
  };

  globalThis.__VERIFIER_TRACE__ = {
    flush() {
      return JSON.parse(JSON.stringify(trace));
    },
    reset() {
      trace.modules_loaded.length = 0;
      trace.network_calls.length = 0;
      trace.fs_operations.length = 0;
      trace.env_access.length = 0;
      trace.process_spawns.length = 0;
      trace.eval_calls.length = 0;
      trace.timers.length = 0;
    },
    record,
  };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    record.module(request);
    return originalLoad.call(this, request, parent, isMain);
  };

  const patchFsRead = (target, methodName) => {
    if (typeof target[methodName] !== 'function') return;
    const original = target[methodName];
    target[methodName] = function patchedFsMethod(...args) {
      record.fs(methodName, args[0]);
      return original.apply(this, args);
    };
  };

  ['readFileSync', 'writeFileSync', 'appendFileSync', 'accessSync', 'statSync'].forEach((methodName) => {
    patchFsRead(fs, methodName);
  });
  ['readFile', 'writeFile', 'appendFile', 'access', 'stat'].forEach((methodName) => {
    patchFsRead(fs, methodName);
  });
  ['readFile', 'writeFile', 'appendFile', 'access', 'stat'].forEach((methodName) => {
    patchFsRead(fsp, methodName);
  });

  process.env = new Proxy(process.env, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') record.env(prop);
      return Reflect.get(target, prop, receiver);
    },
    ownKeys(target) {
      record.env('*');
      return Reflect.ownKeys(target);
    },
  });

  const patchRequest = (mod, defaultProtocol) => {
    const originalRequest = mod.request.bind(mod);
    const originalGet = mod.get.bind(mod);

    mod.request = function patchedRequest(...args) {
      const rawUrl = typeof args[0] === 'string'
        ? args[0]
        : args[0]?.href || args[0]?.protocol && args[0]?.hostname
          ? String(args[0])
          : defaultProtocol;
      record.network('REQUEST', rawUrl);
      return originalRequest(...args);
    };

    mod.get = function patchedGet(...args) {
      const rawUrl = typeof args[0] === 'string'
        ? args[0]
        : args[0]?.href || args[0]?.protocol && args[0]?.hostname
          ? String(args[0])
          : defaultProtocol;
      record.network('GET', rawUrl);
      return originalGet(...args);
    };
  };

  patchRequest(http, 'http:');
  patchRequest(https, 'https:');

  const originalConnect = net.connect.bind(net);
  net.connect = function patchedConnect(...args) {
    record.network('CONNECT', JSON.stringify(args[0] ?? {}));
    return originalConnect(...args);
  };

  ['spawn', 'exec', 'execFile', 'fork'].forEach((methodName) => {
    if (typeof childProcess[methodName] !== 'function') return;
    const original = childProcess[methodName].bind(childProcess);
    childProcess[methodName] = function patchedChildProcess(...args) {
      record.spawn(args[0], Array.isArray(args[1]) ? args[1] : []);
      return original(...args);
    };
  });

  const originalEval = global.eval;
  global.eval = function patchedEval(code) {
    record.eval(code);
    return originalEval(code);
  };

  const OriginalFunction = global.Function;
  global.Function = function patchedFunction(...args) {
    record.eval(args.join('\\n'));
    return OriginalFunction(...args);
  };

  const originalSetTimeout = global.setTimeout;
  global.setTimeout = function patchedSetTimeout(fn, ms, ...args) {
    record.timer('setTimeout', ms ?? 0);
    return originalSetTimeout(fn, ms, ...args);
  };

  const originalSetInterval = global.setInterval;
  global.setInterval = function patchedSetInterval(fn, ms, ...args) {
    record.timer('setInterval', ms ?? 0);
    return originalSetInterval(fn, ms, ...args);
  };
}
`;
