import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_GATEWAY_HOST } from './constants.js';

function inferMimeType(filePath) {
  if (filePath.endsWith('.json')) {
    return 'application/json';
  }

  if (filePath.endsWith('.tgz')) {
    return 'application/gzip';
  }

  return 'application/octet-stream';
}

export async function uploadFileToPinata({ filePath, jwt, name = path.basename(filePath) }) {
  const form = new FormData();
  const buffer = await fs.readFile(filePath);
  const file = new File([buffer], name, { type: inferMimeType(filePath) });

  form.append('file', file);

  const response = await fetch('https://uploads.pinata.cloud/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`
    },
    body: form
  });

  if (!response.ok) {
    throw new Error(`Pinata upload failed with ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const cid = payload?.data?.cid ?? payload?.cid ?? payload?.IpfsHash;

  if (!cid) {
    throw new Error(`Pinata response did not include a CID: ${JSON.stringify(payload)}`);
  }

  return {
    cid,
    payload,
    ipfsUri: `ipfs://${cid}`,
    gatewayUrl: pinataGatewayUrl(cid)
  };
}

export function pinataGatewayUrl(cid, gatewayHost = DEFAULT_GATEWAY_HOST) {
  return `https://${gatewayHost}/ipfs/${cid}`;
}
