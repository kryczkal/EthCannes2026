#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { auditPackage } from '../lib/audit.js';
import { listDemoPackageVersions } from '../lib/demo-packages.js';
import { ensureDir, writeJson } from '../lib/fs.js';
import { uploadFileToPinata } from '../lib/pinata.js';
import { ARTIFACTS_DIR, MANIFEST_PATH, REPORTS_DIR, TARBALLS_DIR } from '../lib/constants.js';
import { packageVersionToEnsName } from '../lib/ens.js';

const LOCAL_NPM_CACHE = path.join(ARTIFACTS_DIR, 'npm-cache');

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

async function packPackage(directoryPath) {
  const command = spawnSync('npm', ['pack', '--json', '--pack-destination', TARBALLS_DIR], {
    cwd: directoryPath,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: LOCAL_NPM_CACHE
    }
  });

  if (command.status !== 0) {
    throw new Error(command.stderr || command.stdout || `npm pack failed in ${directoryPath}`);
  }

  const output = JSON.parse(command.stdout.trim());
  const fileName = output[0]?.filename;
  if (!fileName) {
    throw new Error(`npm pack did not report a tarball filename for ${directoryPath}`);
  }

  return {
    filename: fileName,
    tarballPath: path.join(TARBALLS_DIR, fileName)
  };
}

async function main() {
  await ensureDir(ARTIFACTS_DIR);
  await ensureDir(TARBALLS_DIR);
  await ensureDir(REPORTS_DIR);
  await ensureDir(LOCAL_NPM_CACHE);

  const upload = hasFlag('--upload');
  const jwt = process.env.PINATA_JWT;
  if (upload && !jwt) {
    throw new Error('PINATA_JWT is required when using --upload.');
  }

  const packages = await listDemoPackageVersions();
  const entries = [];

  for (const entry of packages) {
    const packed = await packPackage(entry.directoryPath);
    const audit = await auditPackage(entry);
    const reportPath = path.join(REPORTS_DIR, `${entry.packageName}-${entry.version}.audit.json`);
    await writeJson(reportPath, audit);

    let sourceUpload = null;
    let reportUpload = null;
    if (upload && jwt) {
      sourceUpload = await uploadFileToPinata({
        filePath: packed.tarballPath,
        jwt,
        name: packed.filename
      });
      await waitForGatewayAvailability(sourceUpload.cid);
      reportUpload = await uploadFileToPinata({
        filePath: reportPath,
        jwt,
        name: path.basename(reportPath)
      });
      await waitForGatewayAvailability(reportUpload.cid);
    }

    entries.push({
      packageName: entry.packageName,
      version: entry.version,
      description: entry.description,
      parentName: entry.parentName,
      versionName: packageVersionToEnsName(entry.packageName, entry.version),
      directoryPath: entry.directoryPath,
      source: {
        tarballPath: packed.tarballPath,
        fileName: packed.filename,
        cid: sourceUpload?.cid ?? null,
        ipfsUri: sourceUpload?.ipfsUri ?? null,
        gatewayUrl: sourceUpload?.gatewayUrl ?? null
      },
      audit: {
        ...audit,
        reportPath,
        reportCid: reportUpload?.cid ?? null,
        reportUri: reportUpload?.ipfsUri ?? null,
        reportGatewayUrl: reportUpload?.gatewayUrl ?? null
      }
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    uploadedToPinata: upload,
    entries
  };

  await fs.rm(MANIFEST_PATH, { force: true });
  await writeJson(MANIFEST_PATH, manifest);

  console.log(`Manifest written to ${MANIFEST_PATH}`);
  for (const entry of entries) {
    console.log(
      `${entry.versionName} ${entry.audit.verdict.toUpperCase()} score=${entry.audit.score} sourceCID=${entry.source.cid ?? 'pending'} reportCID=${entry.audit.reportCid ?? 'pending'}`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
