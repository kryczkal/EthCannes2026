import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

const originalCwd = process.cwd();

test("startAuditLog creates a timestamped run directory and numbered log files", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "engine-audit-log-"));
  process.chdir(tempRoot);
  t.after(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const { startAuditLog } = await import(new URL(`../../src/audit-log.ts?t=${Date.now()}`, import.meta.url).href);
  const logger = startAuditLog("axios@1.8.0");

  assert.match(logger.runDir, /audit-logs[\/\\].+axios_1_8_0$/);

  const first = logger.writeLog("resolve.json", { ok: true });
  const second = logger.writeLog("report.txt", "plain text");

  assert.ok(first);
  assert.ok(second);
  assert.match(first ?? "", /01_resolve\.json$/);
  assert.match(second ?? "", /02_report\.txt$/);

  const firstContents = await fs.readFile(first!, "utf8");
  const secondContents = await fs.readFile(second!, "utf8");

  assert.equal(firstContents, JSON.stringify({ ok: true }, null, 2));
  assert.equal(secondContents, "plain text");
});

test("startAuditLog preserves ordering across multiple writes", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "engine-audit-log-order-"));
  process.chdir(tempRoot);
  t.after(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const { startAuditLog } = await import(new URL(`../../src/audit-log.ts?t=${Date.now()}`, import.meta.url).href);
  const logger = startAuditLog("fixture");

  const files = [
    logger.writeLog("a.json", { a: 1 }),
    logger.writeLog("b.json", { b: 2 }),
    logger.writeLog("c.json", { c: 3 }),
  ];

  assert.match(files[0] ?? "", /01_a\.json$/);
  assert.match(files[1] ?? "", /02_b\.json$/);
  assert.match(files[2] ?? "", /03_c\.json$/);
});
