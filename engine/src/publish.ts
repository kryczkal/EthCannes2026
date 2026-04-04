/**
 * Post-audit publish: upload report + source to IPFS (Pinata),
 * then write verdict + CIDs to ENS on Sepolia.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PinataSDK } from "pinata";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  stringToHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { namehash, normalize } from "viem/ens";
import { encode as encodeContentHash } from "@ensdomains/content-hash";
import type { AuditReport } from "./models.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TEXT_RECORD_PREFIX = "npmguard";
const ROOT_DOMAIN = process.env.NPMGUARD_BASE_DOMAIN ?? "npmguard.eth";
const GATEWAY_HOST = process.env.PINATA_GATEWAY_HOST ?? "gateway.pinata.cloud";

const ENS_ADDRESSES = {
  registry: getAddress(process.env.ENS_REGISTRY_ADDRESS ?? "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"),
  nameWrapper: getAddress(process.env.ENS_NAME_WRAPPER_ADDRESS ?? "0x0635513f179D50A207757E05759CbD106d7dFcE8"),
  publicResolver: getAddress(process.env.ENS_PUBLIC_RESOLVER_ADDRESS ?? "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"),
};

// ---------------------------------------------------------------------------
// ABI (minimal)
// ---------------------------------------------------------------------------

const ensRegistryAbi = [
  { type: "function", stateMutability: "view", name: "owner", inputs: [{ name: "node", type: "bytes32" }], outputs: [{ name: "", type: "address" }] },
  { type: "function", stateMutability: "view", name: "resolver", inputs: [{ name: "node", type: "bytes32" }], outputs: [{ name: "", type: "address" }] },
  { type: "function", stateMutability: "nonpayable", name: "setResolver", inputs: [{ name: "node", type: "bytes32" }, { name: "resolver", type: "address" }], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "setSubnodeRecord", inputs: [{ name: "node", type: "bytes32" }, { name: "label", type: "bytes32" }, { name: "owner", type: "address" }, { name: "resolver", type: "address" }, { name: "ttl", type: "uint64" }], outputs: [] },
] as const;

const publicResolverAbi = [
  { type: "function", stateMutability: "nonpayable", name: "multicall", inputs: [{ name: "data", type: "bytes[]" }], outputs: [{ name: "results", type: "bytes[]" }] },
  { type: "function", stateMutability: "nonpayable", name: "setText", inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }, { name: "value", type: "string" }], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "setContenthash", inputs: [{ name: "node", type: "bytes32" }, { name: "hash", type: "bytes" }], outputs: [] },
] as const;

const nameWrapperAbi = [
  { type: "function", stateMutability: "view", name: "getData", inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "owner", type: "address" }, { name: "fuses", type: "uint32" }, { name: "expiry", type: "uint64" }] },
  { type: "function", stateMutability: "nonpayable", name: "setResolver", inputs: [{ name: "node", type: "bytes32" }, { name: "resolver", type: "address" }], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "setSubnodeRecord", inputs: [{ name: "parentNode", type: "bytes32" }, { name: "label", type: "string" }, { name: "owner", type: "address" }, { name: "resolver", type: "address" }, { name: "ttl", type: "uint64" }, { name: "fuses", type: "uint32" }, { name: "expiry", type: "uint64" }], outputs: [{ name: "node", type: "bytes32" }] },
] as const;

// ---------------------------------------------------------------------------
// Pinata upload
// ---------------------------------------------------------------------------

async function uploadToPinata(filePath: string, name: string): Promise<{ cid: string; ipfsUri: string; gatewayUrl: string }> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("PINATA_JWT is required for IPFS upload");

  const buffer = fs.readFileSync(filePath);
  const mime = filePath.endsWith(".json") ? "application/json" : "application/gzip";
  const file = new File([buffer], name, { type: mime });

  const pinata = new PinataSDK({ pinataJwt: jwt, pinataGateway: GATEWAY_HOST });
  const payload = await pinata.upload.public.file(file);
  const cid = payload?.cid;
  if (!cid) throw new Error(`Pinata did not return a CID: ${JSON.stringify(payload)}`);

  return {
    cid,
    ipfsUri: `ipfs://${cid}`,
    gatewayUrl: `https://${GATEWAY_HOST}/ipfs/${cid}`,
  };
}

// ---------------------------------------------------------------------------
// ENS helpers
// ---------------------------------------------------------------------------

function versionToLabel(version: string): string {
  return version.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function createEnsClients() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
  if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required for ENS publish");
  if (!privateKey) throw new Error("SEPOLIA_PRIVATE_KEY is required for ENS publish");

  const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey as `0x${string}` : `0x${privateKey}`);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });

  return { publicClient, walletClient, account };
}

interface NameStatus {
  name: string;
  node: `0x${string}`;
  owner: string;
  resolver: string;
  wrapped: boolean;
  wrappedOwner: string | null;
  expiry: number | null;
}

async function getNameStatus(publicClient: any, name: string): Promise<NameStatus> {
  const normalizedName = normalize(name);
  const node = namehash(normalizedName);

  const owner = await publicClient.readContract({
    address: ENS_ADDRESSES.registry, abi: ensRegistryAbi, functionName: "owner", args: [node],
  }) as string;

  const resolver = await publicClient.readContract({
    address: ENS_ADDRESSES.registry, abi: ensRegistryAbi, functionName: "resolver", args: [node],
  }) as string;

  const wrapped = owner.toLowerCase() === ENS_ADDRESSES.nameWrapper.toLowerCase();
  let wrappedOwner: string | null = null;
  let expiry: number | null = null;

  if (wrapped) {
    const [resolvedOwner, , resolvedExpiry] = await publicClient.readContract({
      address: ENS_ADDRESSES.nameWrapper, abi: nameWrapperAbi, functionName: "getData", args: [BigInt(node)],
    }) as [string, number, bigint];
    wrappedOwner = resolvedOwner;
    expiry = Number(resolvedExpiry);
  }

  return { name: normalizedName, node, owner, resolver, wrapped, wrappedOwner, expiry };
}

async function ensureResolver(publicClient: any, walletClient: any, account: any, status: NameStatus): Promise<string> {
  if (status.resolver && status.resolver !== zeroAddress) return status.resolver;

  const hash = await walletClient.writeContract({
    account,
    address: status.wrapped ? ENS_ADDRESSES.nameWrapper : ENS_ADDRESSES.registry,
    abi: status.wrapped ? nameWrapperAbi : ensRegistryAbi,
    functionName: "setResolver",
    args: [status.node, ENS_ADDRESSES.publicResolver],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return ENS_ADDRESSES.publicResolver;
}

async function createSubname(publicClient: any, walletClient: any, account: any, parentStatus: NameStatus, label: string, resolverAddress: string) {
  const labelHash = keccak256(stringToHex(label));
  const args = parentStatus.wrapped
    ? [parentStatus.node, label, account.address, resolverAddress, 0n, 0, BigInt(parentStatus.expiry ?? Math.floor(Date.now() / 1000) + 31536000)]
    : [parentStatus.node, labelHash, account.address, resolverAddress, 0n];

  const hash = await walletClient.writeContract({
    account,
    address: parentStatus.wrapped ? ENS_ADDRESSES.nameWrapper : ENS_ADDRESSES.registry,
    abi: parentStatus.wrapped ? nameWrapperAbi : ensRegistryAbi,
    functionName: "setSubnodeRecord",
    args,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

async function writeRecords(
  publicClient: any, walletClient: any, account: any,
  resolverAddress: string, node: `0x${string}`,
  textRecords: Record<string, string>, sourceCid?: string,
) {
  const calls: `0x${string}`[] = [];

  if (sourceCid) {
    calls.push(encodeFunctionData({
      abi: publicResolverAbi, functionName: "setContenthash",
      args: [node, `0x${encodeContentHash("ipfs", sourceCid)}`],
    }));
  }

  for (const [key, value] of Object.entries(textRecords)) {
    calls.push(encodeFunctionData({
      abi: publicResolverAbi, functionName: "setText", args: [node, key, value],
    }));
  }

  const hash = await walletClient.writeContract({
    account, address: resolverAddress, abi: publicResolverAbi,
    functionName: "multicall", args: [calls],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PublishResult {
  reportCid: string;
  sourceCid: string;
  reportUrl: string;
  sourceUrl: string;
  ensName: string | null;
  ensTxCount: number;
}

export async function publishAuditResults(
  packageName: string,
  version: string,
  report: AuditReport,
  packagePath: string,
): Promise<PublishResult> {
  console.log(`[publish] starting for ${packageName}@${version}`);

  // --- 1. Upload report JSON to Pinata ---
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), "npmguard-report-"));
  const reportPath = path.join(reportDir, `${packageName}-${version}-report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  let reportUpload: { cid: string; ipfsUri: string; gatewayUrl: string };
  try {
    reportUpload = await uploadToPinata(reportPath, `${packageName}-${version}-report.json`);
    console.log(`[publish] report uploaded: ${reportUpload.cid}`);
  } finally {
    fs.rmSync(reportDir, { recursive: true, force: true });
  }

  // --- 2. Upload source tarball to Pinata ---
  // packagePath is /tmp/npmguard-xxx/extracted/package — tgz is at /tmp/npmguard-xxx/package.tgz
  const tmpdir = path.resolve(packagePath, "..", "..");
  const tgzPath = path.join(tmpdir, "package.tgz");
  let sourceUpload: { cid: string; ipfsUri: string; gatewayUrl: string };

  if (fs.existsSync(tgzPath)) {
    sourceUpload = await uploadToPinata(tgzPath, `${packageName}-${version}.tgz`);
    console.log(`[publish] source uploaded: ${sourceUpload.cid}`);
  } else {
    console.warn(`[publish] no tarball found at ${tgzPath}, skipping source upload`);
    sourceUpload = { cid: "", ipfsUri: "", gatewayUrl: "" };
  }

  // --- 3. Publish to ENS (if configured) ---
  let ensName: string | null = null;
  let ensTxCount = 0;

  if (process.env.SEPOLIA_RPC_URL && process.env.SEPOLIA_PRIVATE_KEY) {
    try {
      const { publicClient, walletClient, account } = createEnsClients();
      const parentName = `${packageName}.${ROOT_DOMAIN}`;
      const versionLabel = versionToLabel(version);
      const versionName = `${versionLabel}.${parentName}`;

      // Ensure base domain is controlled
      const [, ...baseParts] = normalize(parentName).split(".");
      const baseDomain = baseParts.join(".");
      const baseDomainStatus = await getNameStatus(publicClient, baseDomain);
      if (!baseDomainStatus.owner || baseDomainStatus.owner === zeroAddress) {
        throw new Error(`Base ENS name ${baseDomain} is not registered`);
      }

      // Ensure parent subname exists
      let parentStatus = await getNameStatus(publicClient, parentName);
      if (!parentStatus.owner || parentStatus.owner === zeroAddress) {
        const packageLabel = normalize(parentName).split(".")[0]!;
        await createSubname(publicClient, walletClient, account, baseDomainStatus, packageLabel, ENS_ADDRESSES.publicResolver);
        parentStatus = await getNameStatus(publicClient, parentName);
        ensTxCount++;
      }

      const resolverAddress = await ensureResolver(publicClient, walletClient, account, parentStatus);

      // Create version subname
      await createSubname(publicClient, walletClient, account, parentStatus, versionLabel, resolverAddress);
      ensTxCount++;

      const versionNode = namehash(normalize(versionName));
      const now = new Date().toISOString();

      // Write version records
      await writeRecords(publicClient, walletClient, account, resolverAddress, versionNode, {
        [`${TEXT_RECORD_PREFIX}.package`]: packageName,
        [`${TEXT_RECORD_PREFIX}.version`]: version,
        [`${TEXT_RECORD_PREFIX}.verdict`]: report.verdict.toLowerCase(),
        [`${TEXT_RECORD_PREFIX}.score`]: report.triage?.riskScore?.toString() ?? "0",
        [`${TEXT_RECORD_PREFIX}.report_cid`]: reportUpload.cid,
        [`${TEXT_RECORD_PREFIX}.report_uri`]: reportUpload.gatewayUrl,
        [`${TEXT_RECORD_PREFIX}.source_cid`]: sourceUpload.cid,
        [`${TEXT_RECORD_PREFIX}.source_uri`]: sourceUpload.ipfsUri,
        [`${TEXT_RECORD_PREFIX}.capabilities`]: report.capabilities.join(","),
        [`${TEXT_RECORD_PREFIX}.date`]: now,
      }, sourceUpload.cid || undefined);
      ensTxCount++;

      // Write latest records on parent
      await writeRecords(publicClient, walletClient, account, resolverAddress, parentStatus.node, {
        [`${TEXT_RECORD_PREFIX}.latest_version`]: version,
        [`${TEXT_RECORD_PREFIX}.latest_verdict`]: report.verdict.toLowerCase(),
        [`${TEXT_RECORD_PREFIX}.latest_score`]: report.triage?.riskScore?.toString() ?? "0",
        [`${TEXT_RECORD_PREFIX}.latest_report_cid`]: reportUpload.cid,
        [`${TEXT_RECORD_PREFIX}.latest_report_uri`]: reportUpload.gatewayUrl,
        [`${TEXT_RECORD_PREFIX}.latest_source_cid`]: sourceUpload.cid,
        [`${TEXT_RECORD_PREFIX}.latest_source_uri`]: sourceUpload.ipfsUri,
        [`${TEXT_RECORD_PREFIX}.latest_capabilities`]: report.capabilities.join(","),
        [`${TEXT_RECORD_PREFIX}.latest_date`]: now,
      }, sourceUpload.cid || undefined);
      ensTxCount++;

      ensName = versionName;
      console.log(`[publish] ENS published: ${versionName} (${ensTxCount} txs)`);
    } catch (err) {
      console.error("[publish] ENS publish failed:", err instanceof Error ? err.message : err);
    }
  } else {
    console.log("[publish] ENS publish skipped (SEPOLIA_RPC_URL / SEPOLIA_PRIVATE_KEY not set)");
  }

  return {
    reportCid: reportUpload.cid,
    sourceCid: sourceUpload.cid,
    reportUrl: reportUpload.gatewayUrl,
    sourceUrl: sourceUpload.gatewayUrl,
    ensName,
    ensTxCount,
  };
}
