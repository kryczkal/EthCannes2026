import type { DockerSandboxController } from "../sandbox/controller.js";
import { INSTRUMENTATION_JS, buildTimerAdvanceJs } from "../sandbox/instrumentation.js";

const ALLOWED_HOOKS = new Set(["preinstall", "postinstall", "install", "prepare"]);

function parseTraceLog(output: string): string {
  const startMarker = "__NPMGUARD_TRACE__";
  const endMarker = "__NPMGUARD_TRACE_END__";
  const startIdx = output.indexOf(startMarker);
  const endIdx = output.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1) {
    const traceJson = output.slice(startIdx + startMarker.length, endIdx);
    return `TRACE LOG:\n${traceJson}`;
  }
  return output;
}

async function writeInstrumentation(sandbox: DockerSandboxController): Promise<string | null> {
  const result = await sandbox.exec([
    "sh", "-c",
    `cat > /tmp/_instrument.js << 'INSTRUMENT_EOF'\n${INSTRUMENTATION_JS}\nINSTRUMENT_EOF`,
  ]);
  if (result.exitCode !== 0) return `ERROR: failed to write instrumentation: ${result.stderr}`;
  return null;
}

function appendDiagnostics(output: string, result: { timedOut: boolean; stderr: string }, timeoutMsg: string): string {
  let out = output;
  if (result.timedOut) out += `\n[TIMEOUT — ${timeoutMsg}]`;
  if (result.stderr) out += `\nSTDERR: ${result.stderr.slice(0, 2000)}`;
  return out;
}

export async function evalJsImpl(sandbox: DockerSandboxController, code: string): Promise<string> {
  const result = await sandbox.exec(["node", "-e", code]);
  return appendDiagnostics(result.stdout, result, "execution exceeded time limit");
}

export async function requireAndTraceImpl(sandbox: DockerSandboxController, entrypoint: string): Promise<string> {
  const err = await writeInstrumentation(sandbox);
  if (err) return err;

  const result = await sandbox.exec([
    "node", "--require", "/tmp/_instrument.js", "-e",
    `require(${JSON.stringify("./" + entrypoint)})`,
  ]);

  return appendDiagnostics(
    parseTraceLog(result.stdout),
    result,
    "package execution exceeded time limit. This may indicate a DoS payload.",
  );
}

export async function runLifecycleHookImpl(
  sandbox: DockerSandboxController,
  hookName: string,
  scripts: Record<string, string>,
): Promise<string> {
  if (!ALLOWED_HOOKS.has(hookName)) {
    return `ERROR: hook '${hookName}' not in allowlist: ${[...ALLOWED_HOOKS].sort().join(", ")}`;
  }
  const scriptCmd = scripts[hookName];
  if (!scriptCmd) {
    return `ERROR: no '${hookName}' script defined in package.json`;
  }

  const err = await writeInstrumentation(sandbox);
  if (err) return err;

  let result;
  if (scriptCmd.includes("node ") || scriptCmd.endsWith(".js")) {
    result = await sandbox.exec([
      "sh", "-c",
      `NODE_OPTIONS='--require /tmp/_instrument.js' ${scriptCmd}`,
    ]);
  } else {
    result = await sandbox.exec(["sh", "-c", scriptCmd]);
  }

  return appendDiagnostics(
    parseTraceLog(result.stdout),
    result,
    "lifecycle hook exceeded time limit",
  );
}

export async function fastForwardTimersImpl(
  sandbox: DockerSandboxController,
  entrypoint: string,
  advanceMs: number,
): Promise<string> {
  const err = await writeInstrumentation(sandbox);
  if (err) return err;

  const wrapperCode = buildTimerAdvanceJs(entrypoint, advanceMs);

  const result = await sandbox.exec([
    "node", "--require", "/tmp/_instrument.js", "-e", wrapperCode,
  ]);

  return appendDiagnostics(
    parseTraceLog(result.stdout),
    result,
    "timer-advanced execution exceeded limit",
  );
}
