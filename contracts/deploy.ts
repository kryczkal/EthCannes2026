import "dotenv/config";
import { createPublicClient, createWalletClient, http, parseEther, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia, baseSepolia } from "viem/chains";
import { readFileSync } from "node:fs";

// --- Chain definitions ---
const ogGalileo = defineChain({
  id: 16602,
  name: "0G-Galileo-Testnet",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc-testnet.0g.ai"] } },
  blockExplorers: { default: { name: "0G Explorer", url: "https://chainscan-galileo.0g.ai" } },
  testnet: true,
});

const CHAINS: Record<string, {
  chain: any; defaultRpc: string; chainId: string; symbol: string; defaultFee: string;
  verifyApi: string | null; explorerUrl: string;
}> = {
  sepolia: {
    chain: sepolia,
    defaultRpc: "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: "11155111",
    symbol: "ETH",
    defaultFee: "0.001",
    verifyApi: "https://api.etherscan.io/v2/api?chainid=11155111",
    explorerUrl: "https://sepolia.etherscan.io",
  },
  "base-sepolia": {
    chain: baseSepolia,
    defaultRpc: "https://sepolia.base.org",
    chainId: "84532",
    symbol: "ETH",
    defaultFee: "0.001",
    verifyApi: "https://api.etherscan.io/v2/api?chainid=84532",
    explorerUrl: "https://sepolia.basescan.org",
  },
  og: {
    chain: ogGalileo,
    defaultRpc: "https://evmrpc-testnet.0g.ai",
    chainId: "16602",
    symbol: "0G",
    defaultFee: "0.01",
    verifyApi: "https://chainscan-galileo.0g.ai/open/api",
    explorerUrl: "https://chainscan-galileo.0g.ai",
  },
};

// --- Config ---
const TARGET = process.env.DEPLOY_CHAIN ?? "og"; // "sepolia", "base-sepolia", or "og"
const chainConfig = CHAINS[TARGET];
if (!chainConfig) {
  console.error(`Unknown DEPLOY_CHAIN="${TARGET}". Use "sepolia", "base-sepolia", or "og".`);
  process.exit(1);
}

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY ?? process.env.SEPOLIA_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL ?? chainConfig.defaultRpc;
const AUDIT_FEE = parseEther(process.env.AUDIT_FEE ?? chainConfig.defaultFee);

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
  chain: chainConfig.chain,
  transport: http(RPC_URL),
});

const publicClient = createPublicClient({
  chain: chainConfig.chain,
  transport: http(RPC_URL),
});

console.log(`Deploying NpmGuardAuditRequest on ${chainConfig.chain.name}...`);
console.log(`  From:      ${account.address}`);
console.log(`  Audit fee: ${AUDIT_FEE} wei (${process.env.AUDIT_FEE ?? chainConfig.defaultFee} ${chainConfig.symbol})`);
console.log(`  RPC:       ${RPC_URL}`);
console.log();

const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode as `0x${string}`,
  args: [AUDIT_FEE],
});

console.log(`Tx sent: ${hash}`);
console.log(`  Explorer: ${chainConfig.explorerUrl}/tx/${hash}`);
console.log("Waiting for confirmation (up to 5 min)...");

// Manual polling — more resilient than viem's waitForTransactionReceipt on some chains
let receipt: Awaited<ReturnType<typeof publicClient.getTransactionReceipt>> | null = null;
const deadline = Date.now() + 300_000; // 5 min
while (!receipt && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 4_000));
  try {
    receipt = await publicClient.getTransactionReceipt({ hash });
  } catch {
    process.stdout.write(".");
  }
}
if (!receipt) {
  console.error("\nTimed out waiting for receipt. Check the explorer link above.");
  process.exit(1);
}
console.log();

console.log();
console.log(`Contract deployed!`);
console.log(`  Address: ${receipt.contractAddress}`);
console.log(`  Block:   ${receipt.blockNumber}`);
console.log(`  Gas:     ${receipt.gasUsed}`);
console.log();
console.log(`Update cli/src/contract.ts with:`);
console.log(`  export const AUDIT_REQUEST_ADDRESS = "${receipt.contractAddress}";`);
console.log(`  Explorer: ${chainConfig.explorerUrl}/address/${receipt.contractAddress}`);

// --- Verify contract ---
const canVerify = TARGET === "og" || ETHERSCAN_API_KEY;
if (canVerify && chainConfig.verifyApi) {
  console.log();
  console.log(`Verifying on ${chainConfig.explorerUrl}...`);

  const sourceCode = readFileSync("src/NpmGuardAuditRequest.sol", "utf8");
  const constructorArgs = AUDIT_FEE.toString(16).padStart(64, "0");

  const params = new URLSearchParams({
    ...(ETHERSCAN_API_KEY && TARGET !== "og" ? { apikey: ETHERSCAN_API_KEY } : {}),
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
    chainConfig.verifyApi,
    { method: "POST", body: params }
  );
  const verifyResult = await verifyResp.json() as any;

  if (verifyResult.status === "1") {
    const guid = verifyResult.result;
    console.log(`  Submitted (guid: ${guid}). Checking status...`);

    await new Promise((r) => setTimeout(r, 5000));

    const checkUrl = TARGET === "og"
      ? `${chainConfig.verifyApi}?module=contract&action=checkverifystatus&guid=${guid}`
      : `${chainConfig.verifyApi}&module=contract&action=checkverifystatus&guid=${guid}&apikey=${ETHERSCAN_API_KEY}`;
    const checkResp = await fetch(checkUrl);
    const checkResult = await checkResp.json() as any;
    console.log(`  ${checkResult.result}`);
  } else {
    console.log(`  Verification failed: ${verifyResult.result}`);
  }
} else if (!canVerify) {
  console.log();
  console.log("Set ETHERSCAN_API_KEY in .env to auto-verify (Etherscan chains).");
}
