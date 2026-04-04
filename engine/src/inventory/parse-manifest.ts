import type { EntryPoints, PackageMetadata } from "../models.js";

export const LIFECYCLE_SCRIPTS = new Set([
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "prepublish",
]);

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") result[k] = v;
  }
  return result;
}

export function extractScriptFileRef(scriptValue: string): string | null {
  const parts = scriptValue.trim().split(/\s+/);
  if (!parts.length || parts[0] !== "node") return null;
  for (const part of parts.slice(1)) {
    if (!part.startsWith("-")) return part;
  }
  return null;
}

function extractExportsEntries(exports: unknown): string[] {
  if (typeof exports === "string") return [exports];
  if (exports && typeof exports === "object" && !Array.isArray(exports)) {
    const entries: string[] = [];
    for (const value of Object.values(exports)) {
      entries.push(...extractExportsEntries(value));
    }
    return entries;
  }
  return [];
}

function extractBinEntries(bin: unknown): string[] {
  if (typeof bin === "string") return [bin];
  if (bin && typeof bin === "object" && !Array.isArray(bin)) {
    return Object.values(bin).filter((v): v is string => typeof v === "string");
  }
  return [];
}

export function parsePackageJson(
  pkg: Record<string, unknown>,
): {
  metadata: PackageMetadata;
  scripts: Record<string, string>;
  entryPoints: EntryPoints;
  dependencies: Record<string, Record<string, string>>;
} {
  const metadata: PackageMetadata = {
    name: asStringOrNull(pkg.name),
    version: asStringOrNull(pkg.version),
    description: asStringOrNull(pkg.description),
    license: asStringOrNull(pkg.license),
    homepage: asStringOrNull(pkg.homepage),
    repository: pkg.repository ?? null,
  };

  const scripts = asStringRecord(pkg.scripts);

  const installEntries: string[] = [];
  for (const hook of LIFECYCLE_SCRIPTS) {
    const scriptValue = scripts[hook];
    if (scriptValue) {
      const ref = extractScriptFileRef(scriptValue);
      if (ref) installEntries.push(ref);
    }
  }

  let runtimeEntries: string[] = [asStringOrNull(pkg.main) ?? "index.js"];
  const moduleEntry = asStringOrNull(pkg.module);
  if (moduleEntry) runtimeEntries.push(moduleEntry);
  runtimeEntries.push(...extractExportsEntries(pkg.exports));
  runtimeEntries = [...new Set(runtimeEntries)]; // dedup

  const entryPoints: EntryPoints = {
    install: installEntries,
    runtime: runtimeEntries,
    bin: extractBinEntries(pkg.bin),
  };

  const dependencies: Record<string, Record<string, string>> = {
    prod: asStringRecord(pkg.dependencies),
    dev: asStringRecord(pkg.devDependencies),
    optional: asStringRecord(pkg.optionalDependencies),
    peer: asStringRecord(pkg.peerDependencies),
  };

  return { metadata, scripts, entryPoints, dependencies };
}
