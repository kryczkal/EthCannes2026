#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import Hash from 'ipfs-only-hash';
import { CID } from 'multiformats/cid';
import { DEFAULT_GATEWAY_HOST } from '../../../lib/constants.js';
import { ensureDir } from '../../../lib/fs.js';
import { resolveAuditRecord } from '../../../lib/ens.js';

function parseSpec(spec) {
  if (!spec) {
    throw new Error('Usage: sginstall <package>@<version> [--output <dir>] [--gateway <host>]');
  }

  if (spec.startsWith('@')) {
    const separator = spec.lastIndexOf('@');
    if (separator <= 0) {
      throw new Error('Scoped packages are not supported in this demo CLI.');
    }

    return {
      packageName: spec.slice(0, separator),
      version: spec.slice(separator + 1)
    };
  }

  const separator = spec.lastIndexOf('@');
  if (separator === -1) {
    throw new Error('Package spec must include an explicit version, for example axios@1.8.0.');
  }

  return {
    packageName: spec.slice(0, separator),
    version: spec.slice(separator + 1)
  };
}

function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildGatewayCandidates(preferredGatewayHost) {
  return unique([preferredGatewayHost]);
}

function gatewayHeaders() {
  const token = process.env.PINATA_GATEWAY_TOKEN ?? process.env.SGINSTALL_GATEWAY_TOKEN;
  if (!token) {
    return {};
  }

  return {
    'x-pinata-gateway-token': token
  };
}

function gatewayToken() {
  return process.env.PINATA_GATEWAY_TOKEN ?? process.env.SGINSTALL_GATEWAY_TOKEN ?? '';
}

function gatewayUrl(cid, gatewayHost) {
  const url = new URL(`https://${gatewayHost}/ipfs/${cid}`);
  const token = gatewayToken();
  if (token) {
    url.searchParams.set('pinataGatewayToken', token);
  }

  return url.toString();
}

async function downloadFile(cid, filePath, gatewayHosts) {
  const errors = [];
  const headers = gatewayHeaders();

  for (const gatewayHost of gatewayHosts) {
    const url = gatewayUrl(cid, gatewayHost);
    console.error(`Trying gateway: ${url}`);
    try {
      const response = await fetch(url, {
        headers
      });
      if (!response.ok) {
        console.error(`Gateway failed: ${response.status} ${response.statusText}`);
        errors.push(`${url}: ${response.status} ${response.statusText}`);
        continue;
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(filePath, bytes);
      console.error(`Gateway succeeded: ${url}`);
      return {
        bytes,
        url
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Gateway error: ${message}`);
      errors.push(`${url}: ${message}`);
      continue;
    }
  }

  throw new Error(`Failed to download CID ${cid} from available gateways:\n${errors.join('\n')}`);
}

async function main() {
  const spec = process.argv[2];
  const gatewayHost = readFlag('--gateway') ?? process.env.SGINSTALL_GATEWAY_HOST ?? DEFAULT_GATEWAY_HOST;
  const outputDir = readFlag('--output');
  const { packageName, version } = parseSpec(spec);

  const record = await resolveAuditRecord({ packageName, version, gatewayHost });
  if (!record.sourceCid) {
    throw new Error(`ENS record ${record.ensName} does not contain a source CID.`);
  }

  const installRoot =
    outputDir ?? path.join(process.cwd(), 'audited-installs', `${packageName.replace(/[\/@]/g, '-')}-${version}`);
  const tempTarballPath = path.join(os.tmpdir(), `${packageName.replace(/[\/@]/g, '-')}-${version}.tgz`);
  const gatewayHosts = buildGatewayCandidates(gatewayHost);
  const { bytes: tarballBytes, url: downloadUrl } = await downloadFile(record.sourceCid, tempTarballPath, gatewayHosts);
  const computedCid = await Hash.of(tarballBytes);
  const expectedCidNormalized = CID.parse(record.sourceCid).toV1().toString();
  const computedCidNormalized = CID.parse(computedCid).toV1().toString();

  if (computedCidNormalized !== expectedCidNormalized) {
    throw new Error(`CID mismatch: expected ${record.sourceCid}, received ${computedCid}`);
  }

  await ensureDir(installRoot);
  await tar.x({
    cwd: installRoot,
    file: tempTarballPath,
    strip: 1
  });

  console.log(`Resolved ${record.ensName}`);
  console.log(`Verdict: ${record.verdict.toUpperCase()} (score ${record.score})`);
  console.log(`Capabilities: ${record.capabilities.join(', ') || 'none'}`);
  console.log(`Audit report: ${record.reportUri || `https://${gatewayHost}/ipfs/${record.reportCid}`}`);
  console.log(`Source URL: ${downloadUrl}`);
  console.log(`Downloaded audited source to ${installRoot}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
