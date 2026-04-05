import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { listFilesImpl, readFileImpl, searchFilesImpl } from "../../src/investigation/tools-read.ts";
import { createPackageFixture } from "../helpers/package-fixture.ts";

test("readFileImpl returns file contents for a valid text file", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  const contents = readFileImpl(fixture.packagePath, "index.js");
  assert.match(contents, /process\.env\.NPM_TOKEN/);
  assert.match(contents, /fetch\('https:\/\/example\.test\/collect'/);
});

test("readFileImpl blocks path traversal attempts", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  assert.equal(readFileImpl(fixture.packagePath, "../outside.js"), "ERROR: path traversal blocked: ../outside.js");
});

test("readFileImpl reports missing files", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  assert.equal(readFileImpl(fixture.packagePath, "missing.js"), "ERROR: file not found: missing.js");
});

test("readFileImpl rejects directories", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  assert.equal(readFileImpl(fixture.packagePath, "src"), "ERROR: not a file: src");
});

test("readFileImpl rejects files larger than the configured threshold", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  const huge = "x".repeat(100_001);
  const fs = await import("node:fs/promises");
  await fs.writeFile(path.join(fixture.packagePath, "large.js"), huge, "utf8");

  const result = readFileImpl(fixture.packagePath, "large.js");
  assert.match(result, /^ERROR: file too large \(100001 bytes, max 100000\)$/);
});

test("listFilesImpl returns package files and skips node_modules", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  const result = JSON.parse(listFilesImpl(fixture.packagePath)) as Array<{ path: string; size: number; ext: string | null }>;
  const paths = result.map((entry) => entry.path).sort();

  assert.deepEqual(paths, [
    "binary.bin",
    "docs/README.md",
    "index.js",
    "package.json",
    "src/worker.ts",
  ]);
});

test("listFilesImpl includes file extensions and sizes", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  const result = JSON.parse(listFilesImpl(fixture.packagePath)) as Array<{ path: string; size: number; ext: string | null }>;
  const entry = result.find((item) => item.path === "index.js");

  assert.ok(entry);
  assert.equal(entry?.ext, ".js");
  assert.equal(typeof entry?.size, "number");
  assert.ok((entry?.size ?? 0) > 0);
});

test("searchFilesImpl finds case-insensitive matches with context", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  const result = searchFilesImpl(fixture.packagePath, "PROCESS\\.ENV");
  assert.match(result, /\[index\.js:1\]/);
  assert.match(result, /> 1: const token = process\.env\.NPM_TOKEN;/);
});

test("searchFilesImpl returns a no-match message when nothing is found", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  const result = searchFilesImpl(fixture.packagePath, "definitely_no_match");
  assert.equal(result, "No matches for pattern: definitely_no_match");
});

test("searchFilesImpl rejects invalid regex patterns", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  const result = searchFilesImpl(fixture.packagePath, "[unterminated");
  assert.match(result, /^ERROR: invalid regex:/);
});

test("searchFilesImpl skips non-text files", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  const result = searchFilesImpl(fixture.packagePath, "\\x00");
  assert.equal(result, "No matches for pattern: \\x00");
});

test("searchFilesImpl truncates after the maximum number of results", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  const fs = await import("node:fs/promises");
  await fs.writeFile(
    path.join(fixture.packagePath, "many.js"),
    Array.from({ length: 70 }, (_, index) => `const line${index} = process.env.TOKEN_${index};`).join("\n"),
    "utf8",
  );

  const result = searchFilesImpl(fixture.packagePath, "process\\.env");
  assert.match(result, /\.\.\. truncated at 50 results/);
});
