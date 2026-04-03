import fs from 'node:fs/promises';
import path from 'node:path';
import { DEMO_PACKAGES_DIR } from './constants.js';

export async function listDemoPackageVersions() {
  const packages = await fs.readdir(DEMO_PACKAGES_DIR, { withFileTypes: true });
  const results = [];

  for (const packageEntry of packages) {
    if (!packageEntry.isDirectory()) {
      continue;
    }

    const packageRoot = path.join(DEMO_PACKAGES_DIR, packageEntry.name);
    const versions = await fs.readdir(packageRoot, { withFileTypes: true });

    for (const versionEntry of versions) {
      if (!versionEntry.isDirectory()) {
        continue;
      }

      const directoryPath = path.join(packageRoot, versionEntry.name);
      const packageJsonPath = path.join(directoryPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

      results.push({
        packageName: packageJson.name,
        version: packageJson.version,
        description: packageJson.description ?? '',
        directoryPath,
        packageJsonPath,
        parentName: `${packageJson.name}.eth`
      });
    }
  }

  results.sort((left, right) => {
    if (left.packageName === right.packageName) {
      return left.version.localeCompare(right.version, undefined, { numeric: true });
    }

    return left.packageName.localeCompare(right.packageName);
  });

  return results;
}
