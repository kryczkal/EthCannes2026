import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { promises as fs } from "node:fs";

import { ALLOWED_EXTENSIONS, classifyFiles } from "../../src/inventory/classify.ts";
import { createPackageFixture } from "../helpers/package-fixture.ts";

test("ALLOWED_EXTENSIONS contains the common source and config types", () => {
  assert.ok(ALLOWED_EXTENSIONS.has(".js"));
  assert.ok(ALLOWED_EXTENSIONS.has(".json"));
  assert.ok(ALLOWED_EXTENSIONS.has(".ts"));
  assert.ok(ALLOWED_EXTENSIONS.has(".yml"));
});

test("classifyFiles returns file records for text and binary files", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  const records = classifyFiles(fixture.packagePath);
  const indexFile = records.find((file) => file.path === "index.js");
  const binary = records.find((file) => file.path === "binary.bin");

  assert.ok(indexFile);
  assert.equal(indexFile?.fileType, "js");
  assert.equal(indexFile?.isBinary, false);
  assert.ok(binary);
  assert.equal(binary?.fileType, "unknown");
});

test("classifyFiles skips node_modules and .git directories", async (t) => {
  const fixture = await createPackageFixture();
  await fs.mkdir(path.join(fixture.packagePath, ".git"), { recursive: true });
  await fs.writeFile(path.join(fixture.packagePath, ".git", "config"), "ignored", "utf8");
  t.after(async () => {
    await fixture.cleanup();
  });

  const records = classifyFiles(fixture.packagePath);
  const paths = records.map((file) => file.path);

  assert.ok(!paths.some((entry) => entry.startsWith("node_modules/")));
  assert.ok(!paths.some((entry) => entry.startsWith(".git/")));
});

test("classifyFiles classifies known extensions correctly", async (t) => {
  const fixture = await createPackageFixture();
  await fs.writeFile(path.join(fixture.packagePath, "page.html"), "<html></html>", "utf8");
  await fs.writeFile(path.join(fixture.packagePath, "styles.css"), "body {}", "utf8");
  await fs.writeFile(path.join(fixture.packagePath, "config.yml"), "x: 1\n", "utf8");
  await fs.writeFile(path.join(fixture.packagePath, "types.d.ts"), "export type X = string;\n", "utf8");
  t.after(async () => {
    await fixture.cleanup();
  });

  const records = classifyFiles(fixture.packagePath);

  assert.equal(records.find((file) => file.path === "page.html")?.fileType, "web");
  assert.equal(records.find((file) => file.path === "styles.css")?.fileType, "web");
  assert.equal(records.find((file) => file.path === "config.yml")?.fileType, "config");
  assert.equal(records.find((file) => file.path === "types.d.ts")?.fileType, "unknown");
});

test("classifyFiles preserves file permissions in octal form", async (t) => {
  const fixture = await createPackageFixture();
  const executable = path.join(fixture.packagePath, "run.sh");
  await fs.writeFile(executable, "#!/bin/sh\necho hi\n", "utf8");
  await fs.chmod(executable, 0o755);
  t.after(async () => {
    await fixture.cleanup();
  });

  const records = classifyFiles(fixture.packagePath);
  const runFile = records.find((file) => file.path === "run.sh");

  assert.equal(runFile?.fileType, "shell");
  assert.equal(runFile?.permissions, "755");
});

test("classifyFiles detects ELF binaries by magic bytes", async (t) => {
  const fixture = await createPackageFixture();
  const elfPath = path.join(fixture.packagePath, "native-addon");
  await fs.writeFile(elfPath, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x00]));
  t.after(async () => {
    await fixture.cleanup();
  });

  const records = classifyFiles(fixture.packagePath);
  const elf = records.find((file) => file.path === "native-addon");

  assert.ok(elf);
  assert.equal(elf?.isBinary, true);
  assert.equal(elf?.binaryType, "ELF");
  assert.equal(elf?.fileType, "binary");
});
