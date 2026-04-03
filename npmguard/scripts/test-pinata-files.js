#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { ensureDir, writeJson } from '../lib/fs.js';
import { DEFAULT_GATEWAY_HOST, ARTIFACTS_DIR, MANIFEST_PATH } from '../lib/constants.js';
import { uploadFileToPinata, waitForGatewayAvailability } from '../lib/pinata.js';

const REPORT_PATH = path.join(ARTIFACTS_DIR, 'pinata-probe-results.json');
const FIXTURES_DIR = path.join(ARTIFACTS_DIR, 'pinata-test-fixtures');

function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function usage() {
  return [
    'Usage:',
    '  node ./scripts/test-pinata-files.js --fixtures',
    '  node ./scripts/test-pinata-files.js --file <path>',
    '  node ./scripts/test-pinata-files.js --manifest',
    '  node ./scripts/test-pinata-files.js --cid <cid> [--name <label>]',
    '',
    'Options:',
    '  --fixtures          Create synthetic test files, upload them, and verify retrieval.',
    '  --file <path>       Upload exactly one local file and verify the returned CID.',
    '  --manifest          Verify source/report CIDs already recorded in artifacts/demo-manifest.json.',
    '  --cid <cid>         Verify a single existing CID without reuploading anything.',
    '  --name <label>      Optional display name for --cid mode.',
    '  --report <path>     Where to write the JSON results report.',
    '  --gateway <host>    Override the gateway host for verification.'
  ].join('\n');
}

async function loadManifestChecks() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
  return manifest.entries.flatMap((entry) => {
    const checks = [];

    if (entry.source?.cid) {
      checks.push({
        kind: 'manifest-source',
        name: entry.source.fileName ?? `${entry.packageName}-${entry.version}.tgz`,
        cid: entry.source.cid
      });
    }

    if (entry.audit?.reportCid) {
      checks.push({
        kind: 'manifest-report',
        name: path.basename(entry.audit.reportPath ?? `${entry.packageName}-${entry.version}.audit.json`),
        cid: entry.audit.reportCid
      });
    }

    return checks;
  });
}

async function buildFixtures() {
  await ensureDir(FIXTURES_DIR);

  const textPath = path.join(FIXTURES_DIR, 'probe.txt');
  const jsonPath = path.join(FIXTURES_DIR, 'probe.json');
  const htmlPath = path.join(FIXTURES_DIR, 'probe.html');
  const binPath = path.join(FIXTURES_DIR, 'probe.bin');
  const tgzPath = path.join(FIXTURES_DIR, 'probe.tgz');

  const textContent = `Pinata probe ${new Date().toISOString()}\n`;
  const jsonContent = JSON.stringify(
    {
      type: 'pinata-probe',
      createdAt: new Date().toISOString(),
      purpose: 'Verify gateway retrieval for synthetic test fixtures.'
    },
    null,
    2
  );
  const htmlContent = '<!doctype html><html><body><h1>Pinata Probe</h1><p>fixture</p></body></html>\n';
  const binContent = Buffer.from(Array.from({ length: 64 }, (_, index) => index));
  const tgzContent = zlib.gzipSync(Buffer.from('synthetic tgz fixture\n', 'utf8'));

  await Promise.all([
    fs.writeFile(textPath, textContent),
    fs.writeFile(jsonPath, jsonContent),
    fs.writeFile(htmlPath, htmlContent),
    fs.writeFile(binPath, binContent),
    fs.writeFile(tgzPath, tgzContent)
  ]);

  return [
    { kind: 'fixture-text', name: path.basename(textPath), filePath: textPath },
    { kind: 'fixture-json', name: path.basename(jsonPath), filePath: jsonPath },
    { kind: 'fixture-html', name: path.basename(htmlPath), filePath: htmlPath },
    { kind: 'fixture-bin', name: path.basename(binPath), filePath: binPath },
    { kind: 'fixture-tgz', name: path.basename(tgzPath), filePath: tgzPath }
  ];
}

function summarize(results) {
  const summary = {
    passed: 0,
    failed: 0,
    total: results.length,
    byKind: {}
  };

  for (const result of results) {
    if (result.ok) {
      summary.passed += 1;
    } else {
      summary.failed += 1;
    }

    const bucket = summary.byKind[result.kind] ?? { passed: 0, failed: 0, total: 0 };
    bucket.total += 1;
    if (result.ok) {
      bucket.passed += 1;
    } else {
      bucket.failed += 1;
    }
    summary.byKind[result.kind] = bucket;
  }

  return summary;
}

async function verifyCid({ cid, gatewayHost }) {
  const gatewayUrl = await waitForGatewayAvailability(cid, gatewayHost);
  return {
    cid,
    gatewayUrl
  };
}

async function runFixtureProbe({ gatewayHost, jwt }) {
  const fixtures = await buildFixtures();
  const results = [];

  for (const fixture of fixtures) {
    try {
      const upload = await uploadFileToPinata({
        filePath: fixture.filePath,
        jwt,
        name: fixture.name
      });
      const verification = await verifyCid({ cid: upload.cid, gatewayHost });
      results.push({
        ok: true,
        kind: fixture.kind,
        name: fixture.name,
        cid: upload.cid,
        gatewayUrl: verification.gatewayUrl
      });
      console.log(`OK ${fixture.kind} ${fixture.name} -> ${upload.cid}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        ok: false,
        kind: fixture.kind,
        name: fixture.name,
        error: message
      });
      console.log(`FAIL ${fixture.kind} ${fixture.name} -> ${message}`);
    }
  }

  return results;
}

async function runSingleFileProbe({ filePath, gatewayHost, jwt }) {
  const absolutePath = path.resolve(filePath);
  const name = path.basename(absolutePath);

  try {
    const upload = await uploadFileToPinata({
      filePath: absolutePath,
      jwt,
      name
    });
    const verification = await verifyCid({ cid: upload.cid, gatewayHost });
    console.log(`OK file ${name} -> ${upload.cid}`);
    return [
      {
        ok: true,
        kind: 'single-file',
        name,
        filePath: absolutePath,
        cid: upload.cid,
        gatewayUrl: verification.gatewayUrl
      }
    ];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAIL file ${name} -> ${message}`);
    return [
      {
        ok: false,
        kind: 'single-file',
        name,
        filePath: absolutePath,
        error: message
      }
    ];
  }
}

async function runManifestProbe({ gatewayHost }) {
  const checks = await loadManifestChecks();
  const results = [];

  for (const check of checks) {
    try {
      const verification = await verifyCid({ cid: check.cid, gatewayHost });
      results.push({
        ok: true,
        kind: check.kind,
        name: check.name,
        cid: check.cid,
        gatewayUrl: verification.gatewayUrl
      });
      console.log(`OK ${check.kind} ${check.name} -> ${check.cid}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        ok: false,
        kind: check.kind,
        name: check.name,
        cid: check.cid,
        error: message
      });
      console.log(`FAIL ${check.kind} ${check.name} -> ${message}`);
    }
  }

  return results;
}

async function runSingleCidProbe({ cid, name, gatewayHost }) {
  try {
    const verification = await verifyCid({ cid, gatewayHost });
    console.log(`OK single ${name} -> ${cid}`);
    return [
      {
        ok: true,
        kind: 'single-cid',
        name,
        cid,
        gatewayUrl: verification.gatewayUrl
      }
    ];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAIL single ${name} -> ${message}`);
    return [
      {
        ok: false,
        kind: 'single-cid',
        name,
        cid,
        error: message
      }
    ];
  }
}

async function main() {
  const gatewayHost = readFlag('--gateway') ?? process.env.PINATA_GATEWAY_HOST ?? DEFAULT_GATEWAY_HOST;
  const reportPath = path.resolve(readFlag('--report') ?? REPORT_PATH);
  const filePath = readFlag('--file');
  const cid = readFlag('--cid');
  const name = readFlag('--name') ?? cid ?? 'unnamed';
  const fixturesMode = hasFlag('--fixtures');
  const manifestMode = hasFlag('--manifest');
  const jwt = process.env.PINATA_JWT;

  if (!cid && !manifestMode && !fixturesMode && !filePath) {
    throw new Error(usage());
  }

  const activeModes = [Boolean(cid), manifestMode, fixturesMode, Boolean(filePath)].filter(Boolean).length;
  if (activeModes > 1) {
    throw new Error('Use only one of --fixtures, --file, --manifest, or --cid.');
  }

  let results = [];
  if (fixturesMode) {
    if (!jwt) {
      throw new Error('PINATA_JWT is required for --fixtures.');
    }
    results = await runFixtureProbe({ gatewayHost, jwt });
  } else if (filePath) {
    if (!jwt) {
      throw new Error('PINATA_JWT is required for --file.');
    }
    results = await runSingleFileProbe({ filePath, gatewayHost, jwt });
  } else if (cid) {
    results = await runSingleCidProbe({ cid, name, gatewayHost });
  } else {
    results = await runManifestProbe({ gatewayHost });
  }

  await ensureDir(path.dirname(reportPath));
  const report = {
    generatedAt: new Date().toISOString(),
    gatewayHost,
    mode: fixturesMode ? 'fixtures' : filePath ? 'single-file' : cid ? 'single-cid' : 'manifest',
    target: fixturesMode ? FIXTURES_DIR : filePath ? path.resolve(filePath) : cid ? cid : MANIFEST_PATH,
    summary: summarize(results),
    results
  };
  await writeJson(reportPath, report);

  console.log(`Report written to ${reportPath}`);
  console.log(
    `Summary: ${report.summary.passed}/${report.summary.total} passed, ${report.summary.failed} failed`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
