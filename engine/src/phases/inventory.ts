import * as fs from "node:fs";
import * as path from "node:path";
import type { InventoryReport } from "../models.js";
import { classifyFiles } from "../inventory/classify.js";
import { runInventoryChecks } from "../inventory/checks.js";
import { parsePackageJson } from "../inventory/parse-manifest.js";

export async function analyzeInventory(packagePath: string): Promise<InventoryReport> {
  const pkgJsonPath = path.join(packagePath, "package.json");
  let pkg: Record<string, unknown> = {};
  try {
    pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
  } catch (err) {
    console.warn(`[inventory] Failed to parse package.json: ${err instanceof Error ? err.message : "unknown error"}`);
  }

  const { metadata, scripts, entryPoints, dependencies } = parsePackageJson(pkg);
  const files = classifyFiles(packagePath);
  const { flags, dealbreaker } = runInventoryChecks(scripts, entryPoints, files, packagePath);

  return {
    metadata,
    scripts,
    entryPoints,
    dependencies,
    files,
    flags,
    dealbreaker,
  };
}
