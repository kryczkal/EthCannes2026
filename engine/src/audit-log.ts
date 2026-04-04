import * as fs from "node:fs";
import * as path from "node:path";

const AUDIT_LOG_DIR = path.resolve("audit-logs");

let currentRunDir: string | null = null;
let fileCounter = 0;

export function startAuditLog(packageName: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safe = packageName.replace(/[^a-zA-Z0-9_-]/g, "_");
  currentRunDir = path.join(AUDIT_LOG_DIR, `${ts}_${safe}`);
  fileCounter = 0;
  fs.mkdirSync(currentRunDir, { recursive: true });
  console.log(`[audit-log] writing to ${currentRunDir}`);
  return currentRunDir;
}

export function writeLog(name: string, data: unknown): string | null {
  if (!currentRunDir) return null;
  fileCounter++;
  const prefix = String(fileCounter).padStart(2, "0");
  const filename = `${prefix}_${name}`;
  const filePath = path.join(currentRunDir, filename);
  const content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

export function getRunDir(): string | null {
  return currentRunDir;
}
