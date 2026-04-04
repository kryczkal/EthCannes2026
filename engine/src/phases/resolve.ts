import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import * as tar from "tar";
import type { ResolvedPackage } from "../models.js";

const NPM_REGISTRY = "https://registry.npmjs.org";

/** Resolve test fixture packages from the sandbox/test-fixtures directory. */
function resolveTestFixture(packageName: string): string | null {
  // Walk up from engine/src to find the repo root
  const repoRoot = path.resolve(import.meta.dirname, "..", "..");
  const fixturePath = path.join(repoRoot, "..", "sandbox", "test-fixtures", packageName);
  if (fs.existsSync(fixturePath)) return fixturePath;
  return null;
}

export async function resolvePackage(packageName: string): Promise<ResolvedPackage> {
  // Test fixtures: resolve locally
  if (packageName.startsWith("test-pkg-")) {
    const fixturePath = resolveTestFixture(packageName);
    if (fixturePath) {
      return { path: fixturePath, needsCleanup: false, tmpdir: null };
    }
  }

  // Real packages: fetch from npm
  const { tarballUrl } = await resolveTarballUrl(packageName);
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "npmguard-"));

  try {
    const tgzPath = path.join(tmpdir, "package.tgz");
    await downloadFile(tarballUrl, tgzPath);
    const packagePath = await extractTarball(tgzPath, tmpdir);
    return { path: packagePath, needsCleanup: true, tmpdir };
  } catch (err) {
    fs.rmSync(tmpdir, { recursive: true, force: true });
    throw err;
  }
}

export function cleanupPackage(resolved: ResolvedPackage): void {
  if (resolved.needsCleanup && resolved.tmpdir) {
    fs.rmSync(resolved.tmpdir, { recursive: true, force: true });
  }
}

async function resolveTarballUrl(
  packageName: string,
  version = "latest",
): Promise<{ resolvedVersion: string; tarballUrl: string }> {
  const url =
    version === "latest"
      ? `${NPM_REGISTRY}/${packageName}/latest`
      : `${NPM_REGISTRY}/${packageName}/${version}`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) throw new Error(`npm registry returned ${resp.status} for ${url}`);
  const data = (await resp.json()) as { version: string; dist: { tarball: string } };
  return { resolvedVersion: data.version, tarballUrl: data.dist.tarball };
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} for ${url}`);
  const body = resp.body;
  if (!body) throw new Error("No response body");
  await pipeline(Readable.fromWeb(body as never), fs.createWriteStream(dest));
}

async function extractTarball(tgzPath: string, tmpdir: string): Promise<string> {
  const extractDir = path.join(tmpdir, "extracted");
  fs.mkdirSync(extractDir, { recursive: true });

  await tar.extract({
    file: tgzPath,
    cwd: extractDir,
    filter: (entryPath: string) => !entryPath.startsWith("/") && !entryPath.includes(".."),
  });

  // npm tarballs extract into a "package/" subdirectory
  const packageDir = path.join(extractDir, "package");
  if (fs.existsSync(packageDir)) return packageDir;

  // Fallback: first subdirectory
  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  const subdir = entries.find((e) => e.isDirectory());
  return subdir ? path.join(extractDir, subdir.name) : extractDir;
}
