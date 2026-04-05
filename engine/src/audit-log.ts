import * as fs from "node:fs";
import * as path from "node:path";

const AUDIT_LOG_DIR = path.resolve("audit-logs");

export interface AuditLogger {
  writeLog(name: string, data: unknown): string | null;
  readonly runDir: string;
}

export function startAuditLog(packageName: string): AuditLogger {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safe = packageName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const runDir = path.join(AUDIT_LOG_DIR, `${ts}_${safe}`);
  let fileCounter = 0;
  fs.mkdirSync(runDir, { recursive: true });
  console.log(`[audit-log] writing to ${runDir}`);

  return {
    writeLog(name: string, data: unknown): string | null {
      fileCounter++;
      const prefix = String(fileCounter).padStart(2, "0");
      const filename = `${prefix}_${name}`;
      const filePath = path.join(runDir, filename);
      const content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      fs.writeFileSync(filePath, content, "utf-8");
      return filePath;
    },
    runDir,
  };
}
