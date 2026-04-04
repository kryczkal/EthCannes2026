"""Sandbox execution tools for the investigation agent.

Each tool runs commands inside the Docker sandbox via SandboxController.exec().
Results are sanitized before reaching the LLM.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog

if TYPE_CHECKING:
    from npmguard.sandbox.controller import ExecResult, SandboxController

log = structlog.get_logger()

# Allowlist for lifecycle hook names the agent can run.
ALLOWED_HOOKS = frozenset({"preinstall", "postinstall", "install", "prepare"})

# ---------------------------------------------------------------------------
# JS Instrumentation Snippets
# ---------------------------------------------------------------------------

# Monkey-patches sensitive Node.js APIs and logs structured JSON to stdout.
# Injected via `node --require /tmp/_instrument.js <entrypoint>`.
INSTRUMENTATION_JS = r"""
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
    _originals[`fs.${method}`] = fs[method];
    fs[method] = function(path, ...args) {
      _log.push({ type: 'fs', method, path: String(path) });
      return _originals[`fs.${method}`].call(this, path, ...args);
    };
  }
}

// --- Network ---
for (const proto of ['http', 'https']) {
  try {
    const mod = require(proto);
    const _origRequest = mod.request;
    mod.request = function(options, ...args) {
      const url = typeof options === 'string' ? options : `${proto}://${options.hostname || options.host}${options.path || '/'}`;
      _log.push({ type: 'network', method: options.method || 'GET', url });
      return _origRequest.call(this, options, ...args);
    };
  } catch {}
}

// --- Process spawning ---
const cp = require('child_process');
for (const method of ['exec', 'execSync', 'spawn', 'spawnSync', 'fork']) {
  if (typeof cp[method] === 'function') {
    _originals[`cp.${method}`] = cp[method];
    cp[method] = function(cmd, ...args) {
      _log.push({ type: 'process', method, cmd: String(cmd) });
      return _originals[`cp.${method}`].call(this, cmd, ...args);
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
      _originals[`crypto.${method}`] = crypto[method];
      crypto[method] = function(algo, ...args) {
        _log.push({ type: 'crypto', method, algo: String(algo) });
        return _originals[`crypto.${method}`].call(this, algo, ...args);
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
"""

# Timer-advancing wrapper: uses Node.js fake timers pattern.
TIMER_ADVANCE_JS = r"""
'use strict';
const {{ createClock }} = require('@sinonjs/fake-timers');
const clock = createClock();

// Replace globals
global.setTimeout = clock.setTimeout;
global.setInterval = clock.setInterval;
global.clearTimeout = clock.clearTimeout;
global.clearInterval = clock.clearInterval;
global.Date = clock.Date;

// Load the package
require('{entrypoint}');

// Advance time
clock.tick({advance_ms});

// Allow microtasks to settle
setTimeout(() => process.exit(0), 100);
"""


def _parse_trace_log(output: str) -> str:
    """Extract structured trace from instrumentation output."""
    marker_start = "__NPMGUARD_TRACE__"
    marker_end = "__NPMGUARD_TRACE_END__"
    idx_start = output.find(marker_start)
    idx_end = output.find(marker_end)
    if idx_start != -1 and idx_end != -1:
        trace_json = output[idx_start + len(marker_start):idx_end]
        # Return just the trace, not the full noisy output
        return f"TRACE LOG:\n{trace_json}"
    return output


async def eval_js(sandbox: SandboxController, code: str) -> str:
    """Run a JS snippet in the sandbox. For deobfuscation, decoding, etc."""
    result = await sandbox.exec(["node", "-e", code])
    output = result.stdout
    if result.timed_out:
        output += "\n[TIMEOUT — execution exceeded time limit]"
    if result.stderr:
        output += f"\nSTDERR: {result.stderr}"
    return output


async def require_and_trace(sandbox: SandboxController, entrypoint: str) -> str:
    """Load the package with full instrumentation and return structured behavior log."""
    # Write instrumentation to a temp file inside the container
    write_result = await sandbox.exec([
        "sh", "-c",
        f"cat > /tmp/_instrument.js << 'INSTRUMENT_EOF'\n{INSTRUMENTATION_JS}\nINSTRUMENT_EOF",
    ])
    if write_result.exit_code != 0:
        return f"ERROR: failed to write instrumentation: {write_result.stderr}"

    # Run with instrumentation preloaded
    result = await sandbox.exec([
        "node", "--require", "/tmp/_instrument.js", "-e",
        f"require('./{entrypoint}')",
    ])

    output = _parse_trace_log(result.stdout)
    if result.timed_out:
        output += "\n[TIMEOUT — package execution exceeded time limit. This may indicate a DoS payload.]"
    if result.stderr:
        output += f"\nSTDERR: {result.stderr[:2000]}"
    return output


async def run_lifecycle_hook(
    sandbox: SandboxController,
    hook_name: str,
    scripts: dict[str, str],
) -> str:
    """Run a lifecycle script (preinstall/postinstall) with instrumentation."""
    if hook_name not in ALLOWED_HOOKS:
        return f"ERROR: hook {hook_name!r} not in allowlist: {sorted(ALLOWED_HOOKS)}"
    if hook_name not in scripts:
        return f"ERROR: no {hook_name!r} script defined in package.json"

    script_cmd = scripts[hook_name]

    # Write instrumentation
    await sandbox.exec([
        "sh", "-c",
        f"cat > /tmp/_instrument.js << 'INSTRUMENT_EOF'\n{INSTRUMENTATION_JS}\nINSTRUMENT_EOF",
    ])

    # Run the hook script with instrumentation if it's a node command
    if "node " in script_cmd or script_cmd.endswith(".js"):
        result = await sandbox.exec([
            "sh", "-c",
            f"NODE_OPTIONS='--require /tmp/_instrument.js' {script_cmd}",
        ])
    else:
        # Shell scripts — run directly, no Node instrumentation
        result = await sandbox.exec(["sh", "-c", script_cmd])

    output = _parse_trace_log(result.stdout)
    if result.timed_out:
        output += "\n[TIMEOUT — lifecycle hook exceeded time limit]"
    if result.stderr:
        output += f"\nSTDERR: {result.stderr[:2000]}"
    return output


async def fast_forward_timers(
    sandbox: SandboxController,
    entrypoint: str,
    advance_ms: int,
) -> str:
    """Load the package with fake timers and advance time to trigger delayed payloads."""
    wrapper_code = TIMER_ADVANCE_JS.format(
        entrypoint=entrypoint.replace("'", "\\'"),
        advance_ms=advance_ms,
    )

    # Write instrumentation first
    await sandbox.exec([
        "sh", "-c",
        f"cat > /tmp/_instrument.js << 'INSTRUMENT_EOF'\n{INSTRUMENTATION_JS}\nINSTRUMENT_EOF",
    ])

    result = await sandbox.exec([
        "node", "--require", "/tmp/_instrument.js", "-e", wrapper_code,
    ])

    output = _parse_trace_log(result.stdout)
    if result.timed_out:
        output += "\n[TIMEOUT — timer-advanced execution exceeded limit]"
    if result.stderr:
        output += f"\nSTDERR: {result.stderr[:2000]}"
    return output
