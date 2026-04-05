/**
 * Cleanup script: wipe ENS text records for audited packages and unpin all Pinata files.
 *
 * Usage:
 *   npx tsx src/cleanup.ts
 *
 * Requires env vars: SEPOLIA_RPC_URL, SEPOLIA_PRIVATE_KEY, PINATA_JWT
 */

import "dotenv/config";
import { PinataSDK } from "pinata";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { namehash, normalize } from "viem/ens";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT_DOMAIN = process.env.NPMGUARD_BASE_DOMAIN ?? "npmguard.eth";
const GATEWAY_HOST = process.env.PINATA_GATEWAY_HOST ?? "gateway.pinata.cloud";

const ENS_ADDRESSES = {
  registry: getAddress(process.env.ENS_REGISTRY_ADDRESS ?? "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"),
  publicResolver: getAddress(process.env.ENS_PUBLIC_RESOLVER_ADDRESS ?? "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"),
};

const TEXT_KEYS = [
  "npmguard.package",
  "npmguard.version",
  "npmguard.verdict",
  "npmguard.score",
  "npmguard.report_cid",
  "npmguard.report_uri",
  "npmguard.source_cid",
  "npmguard.source_uri",
  "npmguard.capabilities",
  "npmguard.date",
];

const PARENT_TEXT_KEYS = [
  "npmguard.latest_version",
  "npmguard.latest_verdict",
  "npmguard.latest_score",
  "npmguard.latest_report_cid",
  "npmguard.latest_report_uri",
  "npmguard.latest_source_cid",
  "npmguard.latest_source_uri",
  "npmguard.latest_capabilities",
  "npmguard.latest_date",
];

const publicResolverAbi = [
  { type: "function", stateMutability: "nonpayable", name: "multicall", inputs: [{ name: "data", type: "bytes[]" }], outputs: [{ name: "results", type: "bytes[]" }] },
  { type: "function", stateMutability: "nonpayable", name: "setText", inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }, { name: "value", type: "string" }], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "setContenthash", inputs: [{ name: "node", type: "bytes32" }, { name: "hash", type: "bytes" }], outputs: [] },
] as const;

// ---------------------------------------------------------------------------
// ENS: clear text records by writing empty strings
// ---------------------------------------------------------------------------

async function clearEnsRecords(packages: string[], versions: Record<string, string[]>) {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
  if (!rpcUrl || !privateKey) {
    console.log("[ens] Skipped — SEPOLIA_RPC_URL or SEPOLIA_PRIVATE_KEY not set");
    return;
  }

  const account = privateKeyToAccount(
    privateKey.startsWith("0x") ? privateKey as `0x${string}` : `0x${privateKey}`
  );
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });

  for (const pkg of packages) {
    const parentName = `${pkg}.${ROOT_DOMAIN}`;
    const parentNode = namehash(normalize(parentName));

    // Clear parent "latest_*" records
    console.log(`[ens] Clearing parent records: ${parentName}`);
    const parentCalls = PARENT_TEXT_KEYS.map((key) =>
      encodeFunctionData({ abi: publicResolverAbi, functionName: "setText", args: [parentNode, key, ""] })
    );
    // Also clear contenthash
    parentCalls.push(
      encodeFunctionData({ abi: publicResolverAbi, functionName: "setContenthash", args: [parentNode, "0x"] })
    );

    const parentTx = await walletClient.writeContract({
      account,
      address: ENS_ADDRESSES.publicResolver,
      abi: publicResolverAbi,
      functionName: "multicall",
      args: [parentCalls],
    });
    await publicClient.waitForTransactionReceipt({ hash: parentTx });
    console.log(`[ens] Cleared ${parentName} (tx: ${parentTx})`);

    // Clear each version subname
    const versionList = versions[pkg] ?? [];
    for (const version of versionList) {
      const versionLabel = version.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
      const versionName = `${versionLabel}.${parentName}`;
      const versionNode = namehash(normalize(versionName));

      console.log(`[ens] Clearing version records: ${versionName}`);
      const versionCalls = TEXT_KEYS.map((key) =>
        encodeFunctionData({ abi: publicResolverAbi, functionName: "setText", args: [versionNode, key, ""] })
      );
      versionCalls.push(
        encodeFunctionData({ abi: publicResolverAbi, functionName: "setContenthash", args: [versionNode, "0x"] })
      );

      const versionTx = await walletClient.writeContract({
        account,
        address: ENS_ADDRESSES.publicResolver,
        abi: publicResolverAbi,
        functionName: "multicall",
        args: [versionCalls],
      });
      await publicClient.waitForTransactionReceipt({ hash: versionTx });
      console.log(`[ens] Cleared ${versionName} (tx: ${versionTx})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Pinata: unpin all files
// ---------------------------------------------------------------------------

async function clearPinata() {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    console.log("[pinata] Skipped — PINATA_JWT not set");
    return;
  }

  const pinata = new PinataSDK({ pinataJwt: jwt, pinataGateway: GATEWAY_HOST });

  console.log("[pinata] Listing all pinned files...");
  const files = await pinata.files.public.list();
  const fileList = files?.files ?? files ?? [];

  if (!Array.isArray(fileList) || fileList.length === 0) {
    console.log("[pinata] No files to unpin");
    return;
  }

  console.log(`[pinata] Found ${fileList.length} files, unpinning...`);
  for (const file of fileList) {
    const id = file.id ?? file.cid;
    try {
      await pinata.files.public.delete([id]);
      console.log(`[pinata] Unpinned: ${file.name ?? id}`);
    } catch (err) {
      console.error(`[pinata] Failed to unpin ${id}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log("[pinata] Done");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Add the packages and versions you want to clean up here
const PACKAGES_TO_CLEAN = ["axios", "chalk", "dayjs", "dotenv", "express", "uuid"];
const VERSIONS_TO_CLEAN: Record<string, string[]> = {
  dotenv: ["17.4.0"],
  express: ["5.2.1"],
};

async function main() {
  console.log("=== NpmGuard Cleanup ===\n");

  console.log("--- Clearing ENS records ---");
  await clearEnsRecords(PACKAGES_TO_CLEAN, VERSIONS_TO_CLEAN);

  console.log("\n--- Clearing Pinata ---");
  await clearPinata();

  console.log("\n=== Cleanup complete ===");
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
