import { randomUUID } from "node:crypto";
import { dockerExec, type ExecResult } from "./docker.js";

export type { ExecResult };

// ---------------------------------------------------------------------------
// Output sanitization (inline — small enough to not need a separate file)
// ---------------------------------------------------------------------------

const MAX_OUTPUT_BYTES = 64 * 1024;
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

const INJECTION_PATTERNS = [
  "ignore all previous instructions",
  "ignore all instructions",
  "forget all previous",
  "forget your instructions",
  "you are a helpful assistant",
  "do not flag this",
  "do not report this",
  "[system] override",
  "disregard prior instructions",
  "new instruction:",
  "<<SYS>>",
  "[INST]",
];
const REDACTED_MSG = "[REDACTED: potential prompt injection detected in sandbox output]";

function sanitize(raw: string): { text: string; injectionDetected: boolean } {
  let text = raw.replace(ANSI_ESCAPE_RE, "");
  if (text.length > MAX_OUTPUT_BYTES) {
    text = text.slice(0, MAX_OUTPUT_BYTES) + `\n... [truncated at ${MAX_OUTPUT_BYTES} bytes]`;
  }
  const lower = text.toLowerCase();
  const injectionDetected = INJECTION_PATTERNS.some((p) => lower.includes(p));
  if (injectionDetected) return { text: REDACTED_MSG, injectionDetected: true };
  return { text, injectionDetected: false };
}

export class DockerSandboxController {
  private containerId: string | null = null;
  private containerName: string | null = null;

  constructor(
    private image: string = "node:22-slim",
    private memoryLimit: string = "512m",
    private cpuQuota: number = 1.0,
    private network: string = "none",
  ) {}

  get isRunning(): boolean {
    return this.containerId !== null;
  }

  async start(packagePath: string): Promise<void> {
    if (this.containerId) throw new Error("Sandbox already running");

    this.containerName = `npmguard-sandbox-${randomUUID().slice(0, 12)}`;

    const args = [
      "run", "-d",
      "--name", this.containerName,
      `--network=${this.network}`,
      "--cap-drop=ALL",
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
      "--read-only",
      `--memory=${this.memoryLimit}`,
      `--cpus=${this.cpuQuota}`,
      "--user", "1000:1000",
      "--pids-limit", "64",
      "-v", `${packagePath}:/pkg:ro`,
      "-w", "/pkg",
      this.image,
      "sleep", "infinity",
    ];

    console.log(`[sandbox] starting ${this.containerName}`);
    const result = await dockerExec(args, 30_000);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to start sandbox: ${result.stderr}`);
    }
    this.containerId = result.stdout.trim().slice(0, 12);
    console.log(`[sandbox] started ${this.containerId}`);
  }

  async exec(cmd: string[], timeoutS = 15): Promise<ExecResult> {
    if (!this.containerName) throw new Error("Sandbox not running — call start() first");

    const cmdPreview = cmd.map((c) => (c.length > 120 ? c.slice(0, 120) + "…" : c)).join(" ");
    console.log(`[sandbox:exec] $ ${cmdPreview}`);

    const args = ["exec", this.containerName, ...cmd];
    const start = Date.now();
    const result = await dockerExec(args, timeoutS * 1000);
    const elapsed = Date.now() - start;

    if (result.timedOut) {
      console.log(`[sandbox:exec] TIMEOUT after ${elapsed}ms`);
      // Best-effort kill processes inside container
      await dockerExec(["exec", this.containerName, "kill", "-9", "-1"], 5000).catch(() => {});
    }

    const stdout = sanitize(result.stdout);
    const stderr = sanitize(result.stderr);

    const outBytes = stdout.text.length;
    const errBytes = stderr.text.length;
    const injection = stdout.injectionDetected || stderr.injectionDetected;
    console.log(
      `[sandbox:exec] exit=${result.exitCode} ${elapsed}ms stdout=${outBytes}B stderr=${errBytes}B` +
        (result.timedOut ? " TIMED_OUT" : "") +
        (injection ? " INJECTION_REDACTED" : ""),
    );

    return {
      stdout: stdout.text,
      stderr: stderr.text,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
    };
  }

  async stop(): Promise<void> {
    if (!this.containerName) return;
    console.log(`[sandbox] stopping ${this.containerId}`);
    await dockerExec(["rm", "-f", this.containerName], 10_000).catch(() => {});
    this.containerId = null;
    this.containerName = null;
    console.log("[sandbox] stopped");
  }
}
