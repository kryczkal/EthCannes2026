import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { promises as fs } from "node:fs";

import { analyzeInventory } from "../../src/phases/inventory.ts";
import { createPackageFixture } from "../helpers/package-fixture.ts";

test("analyzeInventory returns metadata, files, scripts, and empty flags for a simple fixture", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  const report = await analyzeInventory(fixture.packagePath);

  assert.equal(report.metadata.name, "fixture-pkg");
  assert.equal(report.metadata.version, "1.0.0");
  assert.equal(report.metadata.description, "fixture");
  assert.equal(report.scripts.postinstall, "node scripts/postinstall.js");
  assert.ok(report.files.some((file) => file.path === "index.js"));
  assert.ok(report.files.some((file) => file.path === "src/worker.ts"));
  assert.equal(report.dealbreaker, null);
});

test("analyzeInventory tolerates unreadable or invalid package.json by falling back to defaults", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  await fs.writeFile(path.join(fixture.packagePath, "package.json"), "{not valid json", "utf8");
  const report = await analyzeInventory(fixture.packagePath);

  assert.equal(report.metadata.name, null);
  assert.equal(report.metadata.version, null);
  assert.deepEqual(report.scripts, {});
  assert.equal(report.entryPoints.install.length, 0);
});

test("analyzeInventory surfaces lifecycle-related structural flags when present", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  const report = await analyzeInventory(fixture.packagePath);

  assert.ok(report.flags.some((flag) => flag.check.includes("lifecycle") || flag.detail.includes("postinstall")));
});

test("analyzeInventory classifies binary and text files", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  const report = await analyzeInventory(fixture.packagePath);
  const binary = report.files.find((file) => file.path === "binary.bin");
  const source = report.files.find((file) => file.path === "index.js");

  assert.ok(binary);
  assert.equal(binary?.isBinary, true);
  assert.ok(source);
  assert.equal(source?.isBinary, false);
});

test("analyzeInventory captures dependency buckets from package.json", async (t) => {
  const fixture = await createPackageFixture();
  t.after(async () => {
    await fixture.cleanup();
  });

  await fs.writeFile(
    path.join(fixture.packagePath, "package.json"),
    JSON.stringify(
      {
        name: "fixture-pkg",
        version: "1.0.0",
        dependencies: { axios: "^1.8.0" },
        devDependencies: { typescript: "^5.9.0" },
        optionalDependencies: { fsevents: "^2.3.3" },
      },
      null,
      2,
    ),
    "utf8",
  );

  const report = await analyzeInventory(fixture.packagePath);
  assert.equal(report.dependencies.dependencies?.axios, "^1.8.0");
  assert.equal(report.dependencies.devDependencies?.typescript, "^5.9.0");
  assert.equal(report.dependencies.optionalDependencies?.fsevents, "^2.3.3");
});
