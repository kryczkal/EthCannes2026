/**
 * Cleanup script: delete ENS subnames and unpin all Pinata files.
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
  nameWrapper: getAddress(process.env.ENS_NAME_WRAPPER_ADDRESS ?? "0x0635513f179D50A207757E05759CbD106d7dFcE8"),
  publicResolver: getAddress(process.env.ENS_PUBLIC_RESOLVER_ADDRESS ?? "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"),
};

// ---------------------------------------------------------------------------
// ABI
// ---------------------------------------------------------------------------

const ensRegistryAbi = [
  { type: "function", stateMutability: "view", name: "owner", inputs: [{ name: "node", type: "bytes32" }], outputs: [{ name: "", type: "address" }] },
] as const;

const nameWrapperAbi = [
  { type: "function", stateMutability: "view", name: "getData", inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "owner", type: "address" }, { name: "fuses", type: "uint32" }, { name: "expiry", type: "uint64" }] },
  { type: "function", stateMutability: "nonpayable", name: "setSubnodeOwner", inputs: [{ name: "parentNode", type: "bytes32" }, { name: "label", type: "string" }, { name: "owner", type: "address" }, { name: "fuses", type: "uint32" }, { name: "expiry", type: "uint64" }], outputs: [{ name: "node", type: "bytes32" }] },
] as const;

const publicResolverAbi = [
  { type: "function", stateMutability: "nonpayable", name: "multicall", inputs: [{ name: "data", type: "bytes[]" }], outputs: [{ name: "results", type: "bytes[]" }] },
  { type: "function", stateMutability: "nonpayable", name: "setText", inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }, { name: "value", type: "string" }], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "setContenthash", inputs: [{ name: "node", type: "bytes32" }, { name: "hash", type: "bytes" }], outputs: [] },
] as const;

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

// ---------------------------------------------------------------------------
// ENS: delete subnames via NameWrapper.setSubnodeOwner → address(0)
// ---------------------------------------------------------------------------

async function deleteEnsSubnames(packages: string[], versions: Record<string, string[]>) {
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

    // Delete each version subname first
    const versionList = versions[pkg] ?? [];
    for (const version of versionList) {
      const versionLabel = version.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
      const versionName = `${versionLabel}.${parentName}`;

      console.log(`[ens] Deleting subname: ${versionName}`);
      try {
        const tx = await walletClient.writeContract({
          account,
          address: ENS_ADDRESSES.nameWrapper,
          abi: nameWrapperAbi,
          functionName: "setSubnodeOwner",
          args: [parentNode, versionLabel, zeroAddress, 0, 0n],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        console.log(`[ens] Deleted ${versionName} (tx: ${tx})`);
      } catch (err) {
        console.error(`[ens] Failed to delete ${versionName}:`, err instanceof Error ? err.message : err);
      }
    }

    // Clear parent "latest_*" text records
    console.log(`[ens] Clearing parent records: ${parentName}`);
    const parentCalls = PARENT_TEXT_KEYS.map((key) =>
      encodeFunctionData({ abi: publicResolverAbi, functionName: "setText", args: [parentNode, key, ""] })
    );
    parentCalls.push(
      encodeFunctionData({ abi: publicResolverAbi, functionName: "setContenthash", args: [parentNode, "0x"] })
    );

    try {
      const parentTx = await walletClient.writeContract({
        account,
        address: ENS_ADDRESSES.publicResolver,
        abi: publicResolverAbi,
        functionName: "multicall",
        args: [parentCalls],
      });
      await publicClient.waitForTransactionReceipt({ hash: parentTx });
      console.log(`[ens] Cleared ${parentName} records (tx: ${parentTx})`);
    } catch (err) {
      console.error(`[ens] Failed to clear ${parentName}:`, err instanceof Error ? err.message : err);
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

const PACKAGES_TO_CLEAN = ["dotenv", "express"];
const VERSIONS_TO_CLEAN: Record<string, string[]> = {
  dotenv: ["17.4.0"],
  express: ["5.2.1"],
};

async function main() {
  console.log("=== NpmGuard Cleanup ===\n");

  console.log("--- Deleting ENS subnames ---");
  await deleteEnsSubnames(PACKAGES_TO_CLEAN, VERSIONS_TO_CLEAN);

  console.log("\n--- Clearing Pinata ---");
  await clearPinata();

  console.log("\n=== Cleanup complete ===");
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
