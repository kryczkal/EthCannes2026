import * as fs from "node:fs";
import * as path from "node:path";
import { SKIP_DIRS } from "../config.js";
import type { FileRecord } from "../models.js";

const EXTENSION_TYPE_MAP: Record<string, string> = {
  ".js": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".json": "json",
  ".md": "doc",
  ".txt": "doc",
  ".html": "web",
  ".css": "web",
  ".ts": "ts",
  ".tsx": "ts",
  ".mts": "ts",
  ".sh": "shell",
  ".map": "sourcemap",
  ".yml": "config",
  ".yaml": "config",
};

const MAGIC_BYTES: Array<[string, Buffer]> = [
  ["ELF", Buffer.from([0x7f, 0x45, 0x4c, 0x46])],
  ["MachO", Buffer.from([0xcf, 0xfa, 0xed, 0xfe])],
  ["MachO", Buffer.from([0xce, 0xfa, 0xed, 0xfe])],
  ["PE", Buffer.from([0x4d, 0x5a])],
];

export const ALLOWED_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".json", ".md", ".txt", ".ts", ".tsx", ".mts",
  ".css", ".html", ".yml", ".yaml", ".map", ".d.ts", ".sh", ".LICENSE",
]);

function detectBinary(filePath: string): [boolean, string | null] {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);

    for (const [name, magic] of MAGIC_BYTES) {
      if (buf.subarray(0, magic.length).equals(magic)) {
        return [true, name];
      }
    }
  } catch {
    // ignore read errors
  }
  return [false, null];
}

function permissionsOctal(mode: number): string {
  return (mode & 0o777).toString(8);
}

function walkDir(dir: string, packagePath: string, records: FileRecord[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walkDir(abs, packagePath, records);
      }
      continue;
    }
    if (!entry.isFile()) continue;

    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }

    const rel = path.relative(packagePath, abs);
    const ext = path.extname(entry.name);
    const [isBinary, binaryType] = detectBinary(abs);
    const fileType = isBinary ? "binary" : (EXTENSION_TYPE_MAP[ext] ?? "unknown");

    records.push({
      path: rel,
      fileType,
      sizeBytes: st.size,
      permissions: permissionsOctal(st.mode),
      isBinary,
      binaryType,
    });
  }
}

export function classifyFiles(packagePath: string): FileRecord[] {
  const records: FileRecord[] = [];
  walkDir(packagePath, packagePath, records);
  return records;
}
