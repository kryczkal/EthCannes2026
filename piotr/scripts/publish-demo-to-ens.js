#!/usr/bin/env node

import { MANIFEST_PATH } from '../src/lib/constants.js';
import { publishAuditRecord } from '../src/lib/ens.js';
import { readJson } from '../src/lib/fs.js';

function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

async function main() {
  const manifestPath = readFlag('--manifest') ?? MANIFEST_PATH;
  const packageFilter = readFlag('--package');
  const versionFilter = readFlag('--version');
  const manifest = await readJson(manifestPath);

  const entries = manifest.entries.filter((entry) => {
    if (packageFilter && entry.packageName !== packageFilter) {
      return false;
    }

    if (versionFilter && entry.version !== versionFilter) {
      return false;
    }

    return true;
  });

  if (entries.length === 0) {
    throw new Error('No manifest entries matched the requested filters.');
  }

  for (const entry of entries) {
    if (!entry.source?.cid || !entry.audit?.reportCid) {
      throw new Error(
        `Entry ${entry.packageName}@${entry.version} is missing IPFS CIDs. Run demo:upload first or populate the manifest.`
      );
    }

    const result = await publishAuditRecord(entry);
    console.log(`${result.versionName} published (createSubname=${result.txHashes.createSubname})`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
