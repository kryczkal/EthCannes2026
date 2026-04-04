import { promises as fs } from 'node:fs';
import path from 'node:path';

import { truncateText } from './text.js';

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.md', '.txt', '.yaml', '.yml']);

function assertInsidePackage(packageDir: string, requestedPath: string): string {
  const resolved = path.resolve(packageDir, requestedPath);
  const root = path.resolve(packageDir) + path.sep;

  if (resolved !== path.resolve(packageDir) && !resolved.startsWith(root)) {
    throw new Error(`Path escapes package root: ${requestedPath}`);
  }

  return resolved;
}

async function walk(dir: string, rootDir: string, acc: Array<{ path: string; size: number; type: 'file' | 'dir' }>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(rootDir, abs).split(path.sep).join('/');

    if (entry.isDirectory()) {
      acc.push({ path: rel, size: 0, type: 'dir' });
      await walk(abs, rootDir, acc);
      continue;
    }

    const stat = await fs.stat(abs);
    acc.push({ path: rel, size: stat.size, type: 'file' });
  }
}

export async function listPackageFiles(packageDir: string) {
  const acc: Array<{ path: string; size: number; type: 'file' | 'dir' }> = [];
  await walk(path.resolve(packageDir), path.resolve(packageDir), acc);
  return acc;
}

export async function readPackageFile(packageDir: string, filePath: string, maxChars = 12000) {
  const absPath = assertInsidePackage(packageDir, filePath);
  const ext = path.extname(absPath).toLowerCase();

  if (!TEXT_EXTENSIONS.has(ext)) {
    throw new Error(`Refusing to read non-text file: ${filePath}`);
  }

  return truncateText(await fs.readFile(absPath, 'utf8'), maxChars);
}

export async function searchInPackageFiles(packageDir: string, pattern: string, maxMatches = 25) {
  const files = await listPackageFiles(packageDir);
  const regex = new RegExp(pattern, 'i');
  const matches: Array<{ file: string; line: number; excerpt: string }> = [];

  for (const file of files) {
    if (file.type !== 'file') continue;
    const ext = path.extname(file.path).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;

    const contents = await fs.readFile(path.join(packageDir, file.path), 'utf8');
    const lines = contents.split(/\r?\n/);

    for (let idx = 0; idx < lines.length; idx += 1) {
      if (!regex.test(lines[idx] ?? '')) continue;
      matches.push({ file: file.path, line: idx + 1, excerpt: truncateText(lines[idx] ?? '', 300) });
      if (matches.length >= maxMatches) return matches;
    }
  }

  return matches;
}
