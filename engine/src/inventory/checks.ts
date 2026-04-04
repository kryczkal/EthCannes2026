import * as fs from "node:fs";
import * as path from "node:path";
import { ALLOWED_EXTENSIONS } from "./classify.js";
import { LIFECYCLE_SCRIPTS } from "./parse-manifest.js";
import type { DealBreaker, EntryPoints, FileRecord, InventoryFlag } from "../models.js";

const SHELL_PIPE_PATTERNS = [
  /curl\s.*\|\s*sh\b/i,
  /curl\s.*\|\s*bash\b/i,
  /wget\s.*\|\s*sh\b/i,
  /wget\s.*\|\s*bash\b/i,
  /curl\s.*\|/,
  /wget\s.*-O.*&&\s*(?:sh|bash|chmod)/,
];

const ENCODED_CONTENT_PATTERNS = [
  /[0-9a-f]{64,}/i,
  /[A-Za-z0-9+/]{64,}={0,2}/,
];

const STANDARD_DOTFILES = new Set([
  ".npmignore", ".gitignore", ".browserslistrc", ".editorconfig",
]);
const STANDARD_DOTFILE_PREFIXES = [".eslintrc", ".prettierrc", ".babelrc"];

const JS_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const MINIFIED_LINE_THRESHOLD = 500;

// ---------------------------------------------------------------------------
// Dealbreaker checks
// ---------------------------------------------------------------------------

function checkShellPipe(scripts: Record<string, string>): DealBreaker | null {
  for (const [key, value] of Object.entries(scripts)) {
    for (const pattern of SHELL_PIPE_PATTERNS) {
      if (pattern.test(value)) {
        return { check: "shell-pipe", detail: `Script '${key}' contains shell pipe: ${value}` };
      }
    }
  }
  return null;
}

function checkMissingInstallFile(entryPoints: EntryPoints, files: FileRecord[]): DealBreaker | null {
  const filePaths = new Set(files.map((f) => f.path));
  for (const ref of entryPoints.install) {
    if (!filePaths.has(ref)) {
      return {
        check: "missing-install-script",
        detail: `Install script references '${ref}' but file not found in package`,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Flag checks
// ---------------------------------------------------------------------------

function flagLifecycleScripts(scripts: Record<string, string>): InventoryFlag[] {
  const hooks = Object.keys(scripts).filter((k) => LIFECYCLE_SCRIPTS.has(k));
  if (!hooks.length) return [];
  return [{
    severity: "info",
    check: "lifecycle-scripts",
    detail: `Package declares lifecycle hooks: ${hooks.join(", ")}`,
    file: null,
  }];
}

function flagNonNodeScripts(scripts: Record<string, string>): InventoryFlag[] {
  const flags: InventoryFlag[] = [];
  for (const key of LIFECYCLE_SCRIPTS) {
    const value = scripts[key];
    if (!value) continue;
    const parts = value.trim().split(/\s+/);
    if (!parts.length || parts[0] !== "node") {
      flags.push({
        severity: "warn",
        check: "non-node-script",
        detail: `Lifecycle script '${key}' is not a node command: ${value}`,
        file: null,
      });
    }
  }
  return flags;
}

function flagBinaryFiles(files: FileRecord[]): InventoryFlag[] {
  return files
    .filter((f) => f.isBinary)
    .map((f) => ({
      severity: "warn" as const,
      check: "binary-detected",
      detail: `Binary file detected (${f.binaryType})`,
      file: f.path,
    }));
}

function flagExecutableOutsideBin(files: FileRecord[]): InventoryFlag[] {
  const flags: InventoryFlag[] = [];
  for (const f of files) {
    if (f.path.startsWith("bin/") || f.path.startsWith("bin\\")) continue;
    const mode = parseInt(f.permissions, 8);
    if (mode & 0o111) {
      flags.push({
        severity: "warn",
        check: "executable-outside-bin",
        detail: `File has executable permissions (${f.permissions}) outside bin/`,
        file: f.path,
      });
    }
  }
  return flags;
}

function flagUnusualExtensions(files: FileRecord[]): InventoryFlag[] {
  const flags: InventoryFlag[] = [];
  for (const f of files) {
    const ext = path.extname(f.path);
    if (!ext) continue;
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      flags.push({
        severity: "warn",
        check: "unusual-extension",
        detail: `Unusual file extension: ${ext}`,
        file: f.path,
      });
    }
  }
  return flags;
}

function flagEncodedContent(files: FileRecord[], packagePath: string): InventoryFlag[] {
  const flags: InventoryFlag[] = [];
  for (const f of files) {
    const ext = path.extname(f.path);
    if (JS_EXTENSIONS.has(ext) || f.isBinary || f.sizeBytes === 0) continue;
    const absPath = path.join(packagePath, f.path);
    let content: string;
    try {
      content = fs.readFileSync(absPath, "utf-8");
    } catch {
      continue;
    }
    for (const pattern of ENCODED_CONTENT_PATTERNS) {
      if (pattern.test(content)) {
        flags.push({
          severity: "warn",
          check: "encoded-content",
          detail: `File contains long encoded data (${pattern.source.slice(0, 30)}...)`,
          file: f.path,
        });
        break;
      }
    }
  }
  return flags;
}

function flagMinifiedInstallScript(entryPoints: EntryPoints, packagePath: string): InventoryFlag[] {
  const flags: InventoryFlag[] = [];
  for (const ref of entryPoints.install) {
    const absPath = path.join(packagePath, ref);
    try {
      const content = fs.readFileSync(absPath, "utf-8");
      for (const line of content.split("\n")) {
        if (line.length > MINIFIED_LINE_THRESHOLD) {
          flags.push({
            severity: "warn",
            check: "minified-install-script",
            detail: `Install script has line > ${MINIFIED_LINE_THRESHOLD} chars`,
            file: ref,
          });
          break;
        }
      }
    } catch {
      continue;
    }
  }
  return flags;
}

function flagHiddenDotfiles(files: FileRecord[]): InventoryFlag[] {
  const flags: InventoryFlag[] = [];
  for (const f of files) {
    const basename = path.basename(f.path);
    if (!basename.startsWith(".")) continue;
    if (STANDARD_DOTFILES.has(basename)) continue;
    if (STANDARD_DOTFILE_PREFIXES.some((p) => basename.startsWith(p))) continue;
    flags.push({
      severity: "info",
      check: "hidden-dotfile",
      detail: `Non-standard dotfile: ${basename}`,
      file: f.path,
    });
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function runInventoryChecks(
  scripts: Record<string, string>,
  entryPoints: EntryPoints,
  files: FileRecord[],
  packagePath: string,
): { flags: InventoryFlag[]; dealbreaker: DealBreaker | null } {
  // Dealbreakers first
  let dealbreaker = checkShellPipe(scripts);
  if (dealbreaker) return { flags: [], dealbreaker };

  dealbreaker = checkMissingInstallFile(entryPoints, files);
  if (dealbreaker) return { flags: [], dealbreaker };

  // Accumulate flags
  const flags: InventoryFlag[] = [
    ...flagLifecycleScripts(scripts),
    ...flagNonNodeScripts(scripts),
    ...flagBinaryFiles(files),
    ...flagExecutableOutsideBin(files),
    ...flagUnusualExtensions(files),
    ...flagEncodedContent(files, packagePath),
    ...flagMinifiedInstallScript(entryPoints, packagePath),
    ...flagHiddenDotfiles(files),
  ];

  return { flags, dealbreaker: null };
}
