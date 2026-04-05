import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { cleanupPackage, resolvePackage } from "../../src/phases/resolve.ts";

test("resolvePackage returns local sandbox fixtures without cleanup", async () => {
  const resolved = await resolvePackage("test-pkg-env-exfil");

  assert.match(resolved.path, /sandbox[\/\\]test-fixtures[\/\\]test-pkg-env-exfil$/);
  assert.equal(resolved.needsCleanup, false);
  assert.equal(resolved.tmpdir, null);
});

test("cleanupPackage removes tmpdir when cleanup is required", async () => {
  const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "engine-cleanup-"));
  const nested = path.join(tmpdir, "nested.txt");
  await fs.writeFile(nested, "cleanup me", "utf8");

  cleanupPackage({
    path: tmpdir,
    needsCleanup: true,
    tmpdir,
  });

  await assert.rejects(() => fs.access(tmpdir));
});

test("cleanupPackage is a no-op when cleanup is not required", async () => {
  const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "engine-keep-"));
  const nested = path.join(tmpdir, "keep.txt");
  await fs.writeFile(nested, "keep me", "utf8");

  cleanupPackage({
    path: tmpdir,
    needsCleanup: false,
    tmpdir,
  });

  await fs.access(nested);
  await fs.rm(tmpdir, { recursive: true, force: true });
});

test("cleanupPackage tolerates missing tmpdir when cleanup is required", () => {
  cleanupPackage({
    path: "/tmp/nonexistent",
    needsCleanup: true,
    tmpdir: null,
  });

  assert.ok(true);
});
