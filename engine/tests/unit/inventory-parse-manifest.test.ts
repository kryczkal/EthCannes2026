import test from "node:test";
import assert from "node:assert/strict";

import { extractScriptFileRef, LIFECYCLE_SCRIPTS, parsePackageJson } from "../../src/inventory/parse-manifest.ts";

test("LIFECYCLE_SCRIPTS contains the expected npm hook names", () => {
  assert.ok(LIFECYCLE_SCRIPTS.has("preinstall"));
  assert.ok(LIFECYCLE_SCRIPTS.has("install"));
  assert.ok(LIFECYCLE_SCRIPTS.has("postinstall"));
  assert.ok(LIFECYCLE_SCRIPTS.has("prepare"));
  assert.ok(LIFECYCLE_SCRIPTS.has("prepublish"));
});

test("extractScriptFileRef returns the first non-flag node script argument", () => {
  assert.equal(extractScriptFileRef("node scripts/postinstall.js"), "scripts/postinstall.js");
  assert.equal(extractScriptFileRef("node --require ./hook.cjs scripts/start.js"), "./hook.cjs");
});

test("extractScriptFileRef returns null for non-node commands", () => {
  assert.equal(extractScriptFileRef("bash install.sh"), null);
  assert.equal(extractScriptFileRef("npm run build"), null);
  assert.equal(extractScriptFileRef(""), null);
});

test("parsePackageJson returns metadata, scripts, entry points, and dependency buckets", () => {
  const parsed = parsePackageJson({
    name: "fixture-pkg",
    version: "1.0.0",
    description: "fixture description",
    license: "MIT",
    homepage: "https://example.test",
    repository: { type: "git", url: "https://example.test/repo.git" },
    main: "dist/index.js",
    module: "dist/index.mjs",
    exports: {
      ".": {
        import: "./dist/index.mjs",
        require: "./dist/index.cjs",
      },
      "./feature": "./dist/feature.js",
    },
    bin: {
      fixture: "./bin/fixture.js",
    },
    scripts: {
      postinstall: "node scripts/postinstall.js",
      build: "tsc -p .",
    },
    dependencies: { axios: "^1.8.0" },
    devDependencies: { typescript: "^5.9.0" },
    optionalDependencies: { fsevents: "^2.3.3" },
    peerDependencies: { react: "^19.0.0" },
  });

  assert.equal(parsed.metadata.name, "fixture-pkg");
  assert.equal(parsed.metadata.version, "1.0.0");
  assert.equal(parsed.metadata.description, "fixture description");
  assert.equal(parsed.metadata.license, "MIT");
  assert.equal(parsed.metadata.homepage, "https://example.test");
  assert.deepEqual(parsed.scripts, {
    postinstall: "node scripts/postinstall.js",
    build: "tsc -p .",
  });
  assert.deepEqual(parsed.entryPoints.install, ["scripts/postinstall.js"]);
  assert.deepEqual(parsed.entryPoints.bin, ["./bin/fixture.js"]);
  assert.deepEqual(parsed.entryPoints.runtime, [
    "dist/index.js",
    "dist/index.mjs",
    "./dist/index.mjs",
    "./dist/index.cjs",
    "./dist/feature.js",
  ]);
  assert.deepEqual(parsed.dependencies, {
    prod: { axios: "^1.8.0" },
    dev: { typescript: "^5.9.0" },
    optional: { fsevents: "^2.3.3" },
    peer: { react: "^19.0.0" },
  });
});

test("parsePackageJson falls back to index.js when main is missing", () => {
  const parsed = parsePackageJson({
    name: "fixture-pkg",
    scripts: {},
  });

  assert.deepEqual(parsed.entryPoints.runtime, ["index.js"]);
});

test("parsePackageJson filters non-string values out of records", () => {
  const parsed = parsePackageJson({
    scripts: {
      ok: "node index.js",
      bad: 42,
    },
    dependencies: {
      ok: "^1.0.0",
      bad: false,
    },
    bin: {
      ok: "./bin.js",
      bad: 123,
    },
  });

  assert.deepEqual(parsed.scripts, { ok: "node index.js" });
  assert.deepEqual(parsed.dependencies.prod, { ok: "^1.0.0" });
  assert.deepEqual(parsed.entryPoints.bin, ["./bin.js"]);
});

test("parsePackageJson deduplicates runtime entries", () => {
  const parsed = parsePackageJson({
    main: "index.js",
    exports: {
      ".": "index.js",
      "./other": "index.js",
    },
  });

  assert.deepEqual(parsed.entryPoints.runtime, ["index.js"]);
});
