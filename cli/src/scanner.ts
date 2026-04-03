import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface PackageDep {
  name: string;
  installed: string;
  latest: string | null;
  hasUpdate: boolean;
}

export async function scanProject(projectPath: string): Promise<PackageDep[]> {
  const pkgPath = join(projectPath, "package.json");
  const raw = await readFile(pkgPath, "utf-8");
  const pkg = JSON.parse(raw);

  const allDeps: Record<string, string> = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  const results: PackageDep[] = [];

  for (const [name, versionRange] of Object.entries(allDeps)) {
    // Strip ^, ~, >= etc. to get the installed version
    const installed = versionRange.replace(/^[\^~>=<]*/, "");

    // Fetch latest from npm registry
    let latest: string | null = null;
    try {
      const resp = await fetch(
        `https://registry.npmjs.org/${name}/latest`
      );
      if (resp.ok) {
        const data = await resp.json();
        latest = data.version;
      }
    } catch {
      // Network error — skip
    }

    results.push({
      name,
      installed,
      latest,
      hasUpdate: latest !== null && latest !== installed,
    });
  }

  return results;
}
