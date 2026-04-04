import "dotenv/config";
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { readFileSync } from "node:fs";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const CHAIN_ID = "11155111"; // Sepolia

// --- Config ---
const PRIVATE_KEY = process.env.PRIVATE_KEY ?? process.env.SEPOLIA_PRIVATE_KEY;
const RPC_URL =
  process.env.RPC_URL ??
  process.env.SEPOLIA_RPC_URL ??
  "https://ethereum-sepolia-rpc.publicnode.com";
const AUDIT_FEE = parseEther(process.env.AUDIT_FEE ?? "0.001");

if (!PRIVATE_KEY) {
  console.error("Set PRIVATE_KEY or SEPOLIA_PRIVATE_KEY env var");
  process.exit(1);
}

// --- Load compiled artifact ---
const artifact = JSON.parse(readFileSync("out/NpmGuardAuditRequest.json", "utf8"));

// --- Deploy ---
const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(RPC_URL),
});

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

console.log(`Deploying NpmGuardAuditRequest...`);
console.log(`  From:      ${account.address}`);
console.log(`  Audit fee: ${AUDIT_FEE} wei (${process.env.AUDIT_FEE ?? "0.001"} ETH)`);
console.log(`  RPC:       ${RPC_URL}`);
console.log();

const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode as `0x${string}`,
  args: [AUDIT_FEE],
});

console.log(`Tx sent: ${hash}`);
console.log("Waiting for confirmation...");

const receipt = await publicClient.waitForTransactionReceipt({ hash });

console.log();
console.log(`Contract deployed!`);
console.log(`  Address: ${receipt.contractAddress}`);
console.log(`  Block:   ${receipt.blockNumber}`);
console.log(`  Gas:     ${receipt.gasUsed}`);
console.log();
console.log(`Update cli/src/contract.ts with:`);
console.log(`  export const AUDIT_REQUEST_ADDRESS = "${receipt.contractAddress}";`);

// --- Verify on Etherscan ---
if (ETHERSCAN_API_KEY) {
  console.log();
  console.log("Verifying on Etherscan...");

  const sourceCode = readFileSync("src/NpmGuardAuditRequest.sol", "utf8");
  const constructorArgs = AUDIT_FEE.toString(16).padStart(64, "0");

  const params = new URLSearchParams({
    apikey: ETHERSCAN_API_KEY,
    module: "contract",
    action: "verifysourcecode",
    contractaddress: receipt.contractAddress!,
    sourceCode,
    codeformat: "solidity-single-file",
    contractname: "NpmGuardAuditRequest",
    compilerversion: "v0.8.34+commit.80d5c536",
    optimizationUsed: "0",
    runs: "200",
    constructorArguements: constructorArgs,
    licenseType: "1",
  });

  const verifyResp = await fetch(
    `https://api.etherscan.io/v2/api?chainid=${CHAIN_ID}`,
    { method: "POST", body: params }
  );
  const verifyResult = await verifyResp.json() as any;

  if (verifyResult.status === "1") {
    const guid = verifyResult.result;
    console.log(`  Submitted (guid: ${guid}). Checking status...`);

    // Poll for verification result
    await new Promise((r) => setTimeout(r, 5000));

    const checkResp = await fetch(
      `https://api.etherscan.io/v2/api?chainid=${CHAIN_ID}&module=contract&action=checkverifystatus&guid=${guid}&apikey=${ETHERSCAN_API_KEY}`
    );
    const checkResult = await checkResp.json() as any;
    console.log(`  ${checkResult.result}`);
  } else {
    console.log(`  Verification failed: ${verifyResult.result}`);
  }
} else {
  console.log();
  console.log("Set ETHERSCAN_API_KEY in .env to auto-verify on Etherscan.");
}
