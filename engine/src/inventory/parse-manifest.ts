import type { EntryPoints, PackageMetadata } from "../models.js";

export const LIFECYCLE_SCRIPTS = new Set([
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "prepublish",
]);

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
    name: (pkg.name as string) ?? null,
    version: (pkg.version as string) ?? null,
    description: (pkg.description as string) ?? null,
    license: (pkg.license as string) ?? null,
    homepage: (pkg.homepage as string) ?? null,
    repository: pkg.repository ?? null,
  };

  const scripts = (pkg.scripts as Record<string, string>) ?? {};

  const installEntries: string[] = [];
  for (const hook of LIFECYCLE_SCRIPTS) {
    const scriptValue = scripts[hook];
    if (scriptValue) {
      const ref = extractScriptFileRef(scriptValue);
      if (ref) installEntries.push(ref);
    }
  }

  let runtimeEntries: string[] = [(pkg.main as string) ?? "index.js"];
  if (pkg.module) runtimeEntries.push(pkg.module as string);
  runtimeEntries.push(...extractExportsEntries(pkg.exports));
  runtimeEntries = [...new Set(runtimeEntries)]; // dedup

  const entryPoints: EntryPoints = {
    install: installEntries,
    runtime: runtimeEntries,
    bin: extractBinEntries(pkg.bin),
  };

  const dependencies: Record<string, Record<string, string>> = {
    prod: (pkg.dependencies as Record<string, string>) ?? {},
    dev: (pkg.devDependencies as Record<string, string>) ?? {},
    optional: (pkg.optionalDependencies as Record<string, string>) ?? {},
    peer: (pkg.peerDependencies as Record<string, string>) ?? {},
  };

  return { metadata, scripts, entryPoints, dependencies };
}
