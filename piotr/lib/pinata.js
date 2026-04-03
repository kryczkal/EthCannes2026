import fs from 'node:fs/promises';
import path from 'node:path';
import { PinataSDK } from 'pinata';
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

function createPinataClient(pinataJwt) {
  return new PinataSDK({
    pinataJwt,
    pinataGateway: DEFAULT_GATEWAY_HOST,
    pinataGatewayKey: gatewayToken() || undefined
  });
}

function gatewayUrlWithToken(url) {
  const token = gatewayToken();
  if (!token) {
    return url;
  }

  const parsed = new URL(url);
  parsed.searchParams.set('pinataGatewayToken', token);
  return parsed.toString();
}

function pinataVerificationTimeoutMs() {
  const timeoutMs = Number.parseInt(process.env.PINATA_VERIFY_TIMEOUT_MS ?? '12000', 10);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 12000;
}

export async function waitForGatewayAvailability(cid, gatewayHost = DEFAULT_GATEWAY_HOST) {
  const timeoutMs = pinataVerificationTimeoutMs();
  const headers = gatewayHeaders();
  const url = gatewayUrlWithToken(pinataGatewayUrl(cid, gatewayHost));

  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    await response.arrayBuffer();
    return url;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Uploaded CID ${cid} was not available on ${gatewayHost}. Last error: ${message}`);
  }
}

export async function uploadFileToPinata({ filePath, jwt, name = path.basename(filePath) }) {
  const buffer = await fs.readFile(filePath);
  const file = new File([buffer], name, { type: inferMimeType(filePath) });
  const pinata = createPinataClient(jwt);
  const payload = await pinata.upload.public.file(file);
  const cid = payload?.cid;

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
