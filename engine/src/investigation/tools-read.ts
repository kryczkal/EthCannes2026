import * as fs from "node:fs";
import * as path from "node:path";

const MAX_FILE_READ = 100_000; // 100 KB
const MAX_SEARCH_RESULTS = 50;
const CONTEXT_LINES = 3;
const SKIP_DIRS = new Set(["node_modules", ".git", ".svn"]);
const TEXT_EXTS = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".json", ".md", ".txt", ".yml", ".yaml"]);

function safePath(packagePath: string, relPath: string): string | null {
  const abs = path.normalize(path.join(packagePath, relPath));
  const base = path.normalize(packagePath);
  if (!abs.startsWith(base + path.sep) && abs !== base) return null;
  return abs;
}

export function readFileImpl(packagePath: string, relPath: string): string {
  const abs = safePath(packagePath, relPath);
  if (!abs) return `ERROR: path traversal blocked: ${relPath}`;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return `ERROR: file not found: ${relPath}`;
  }
  try {
    const size = fs.statSync(abs).size;
    if (size > MAX_FILE_READ) return `ERROR: file too large (${size} bytes, max ${MAX_FILE_READ})`;
    return fs.readFileSync(abs, "utf-8");
  } catch (err) {
    return `ERROR: ${err}`;
  }
}

export function listFilesImpl(packagePath: string): string {
  const entries: Array<{ path: string; size: number; ext: string | null }> = [];

  function walk(dir: string) {
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of dirents) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      let size = -1;
      try { size = fs.statSync(abs).size; } catch { /* skip */ }
      const ext = path.extname(entry.name) || null;
      entries.push({ path: path.relative(packagePath, abs), size, ext });
    }
  }

  walk(packagePath);
  return JSON.stringify(entries, null, 2);
}

export function searchFilesImpl(packagePath: string, pattern: string): string {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "i");
  } catch (err) {
    return `ERROR: invalid regex: ${err}`;
  }

  const results: string[] = [];

  function walk(dir: string) {
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of dirents) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name);
      if (!TEXT_EXTS.has(ext)) continue;

      let lines: string[];
      try {
        lines = fs.readFileSync(abs, "utf-8").split("\n");
      } catch {
        continue;
      }

      const rel = path.relative(packagePath, abs);
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          const start = Math.max(0, i - CONTEXT_LINES);
          const end = Math.min(lines.length, i + CONTEXT_LINES + 1);
          const snippet = lines
            .slice(start, end)
            .map((l, j) => `  ${j + start === i ? ">" : " "} ${j + start + 1}: ${l}`)
            .join("\n");
          results.push(`[${rel}:${i + 1}]\n${snippet}`);

          if (results.length >= MAX_SEARCH_RESULTS) {
            results.push(`... truncated at ${MAX_SEARCH_RESULTS} results`);
            return;
          }
        }
      }
    }
  }

  walk(packagePath);
  return results.length ? results.join("\n") : `No matches for pattern: ${pattern}`;
}
