import chalk from "chalk";
import ora from "ora";
import qrcode from "qrcode-terminal";
import { createInterface } from "node:readline";
import { execSync } from "node:child_process";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import { SignClient } from "@walletconnect/sign-client";
import type { AuditSource } from "../audit-source.js";
import {
  AUDIT_REQUEST_ADDRESS_0G,
  AUDIT_REQUEST_ABI,
} from "../contract.js";

const ogGalileo = defineChain({
  id: 16602,
  name: "0G-Galileo-Testnet",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc-testnet.0g.ai"] } },
  blockExplorers: { default: { name: "0G Explorer", url: "https://chainscan-galileo.0g.ai" } },
  testnet: true,
});

const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_ENGINE_URL = "http://209.38.42.28:8000";
const WALLETCONNECT_PROJECT_ID = process.env.WALLETCONNECT_PROJECT_ID ?? "d5eb170c427570e15ac00ae53acc93ba";
const OG_RPC = "https://evmrpc-testnet.0g.ai";
const BLOCK_EXPLORER = "https://chainscan-galileo.0g.ai";

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function generateQrCode(text: string): Promise<void> {
  return new Promise((resolve) => {
    qrcode.generate(text, { small: true }, (code: string) => {
      console.log(code);
      resolve();
    });
  });
}

async function askInstallWithoutAudit(packageSpec: string) {
  const answer = await prompt(
    chalk.white(`  Install from npm without audit? (y/n) `)
  );
  if (answer === "y" || answer === "yes") {
    console.log();
    execSync(`npm install ${packageSpec}`, { stdio: "inherit" });
  }
}

async function requestAuditOnChain(
  packageName: string,
  version: string,
  privateKey: string
): Promise<string> {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const rpcUrl = OG_RPC;

  const publicClient = createPublicClient({
    chain: ogGalileo,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: ogGalileo,
    transport: http(rpcUrl),
  });

  const auditFee = await publicClient.readContract({
    address: AUDIT_REQUEST_ADDRESS_0G,
    abi: AUDIT_REQUEST_ABI,
    functionName: "auditFee",
  });

  const hash = await walletClient.writeContract({
    address: AUDIT_REQUEST_ADDRESS_0G,
    abi: AUDIT_REQUEST_ABI,
    functionName: "requestAudit",
    args: [packageName, version],
    value: auditFee,
  });

  await publicClient.waitForTransactionReceipt({ hash });

  return hash;
}

async function payViaWalletConnect(
  packageName: string,
  version: string,
  feeWei: bigint,
  feeDisplay: string
): Promise<boolean> {
  const calldata = encodeFunctionData({
    abi: AUDIT_REQUEST_ABI,
    functionName: "requestAudit",
    args: [packageName, version],
  });

  let signClient: InstanceType<typeof SignClient> | null = null;

  // WalletConnect throws unhandled errors when MetaMask sends
  // session events after the session is cleaned up — suppress them
  const wcErrorHandler = (err: Error) => {
    if (err?.message?.includes("No matching key")) return;
    console.error(err);
    process.exit(1);
  };
  process.on("uncaughtException", wcErrorHandler);

  try {
    const initSpinner = ora("  Connecting to WalletConnect...").start();
    signClient = await SignClient.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: {
        name: "NpmGuard",
        description: "NPM package security audit",
        url: "https://npmguard.dev",
        icons: [],
      },
    });
    initSpinner.stop();

    const { uri, approval } = await signClient.connect({
      requiredNamespaces: {
        eip155: {
          methods: ["eth_sendTransaction"],
          chains: ["eip155:16602"],
          events: ["chainChanged", "accountsChanged"],
        },
      },
    });

    if (!uri) {
      console.log(chalk.red("  Failed to generate WalletConnect URI"));
      return false;
    }

    console.log();
    console.log(chalk.cyan(`  Scan with your wallet to connect:`));
    console.log();
    await generateQrCode(uri);
    console.log();

    const pairSpinner = ora("  Waiting for wallet connection...").start();
    const session = await approval();

    // Find the 0G Galileo account in approved namespaces
    const accounts = session.namespaces.eip155?.accounts ?? [];
    const ogAccount = accounts.find((a: string) => a.startsWith("eip155:16602:"));
    const account = ogAccount
      ? ogAccount.split(":")[2]
      : accounts[0]?.split(":")[2];

    if (!account) {
      pairSpinner.fail("Wallet did not approve any accounts");
      return false;
    }

    pairSpinner.succeed(`Connected: ${account.slice(0, 6)}...${account.slice(-4)}`);

    console.log(
      chalk.cyan(`  Confirm the ${feeDisplay} transaction in your wallet...`)
    );

    const txHash = await signClient.request({
      topic: session.topic,
      chainId: "eip155:16602",
      request: {
        method: "eth_sendTransaction",
        params: [
          {
            from: account,
            to: AUDIT_REQUEST_ADDRESS_0G,
            data: calldata,
            value: "0x" + feeWei.toString(16),
          },
        ],
      },
    });

    const confirmSpinner = ora("  Waiting for on-chain confirmation...").start();
    const ogClient = createPublicClient({
      chain: ogGalileo,
      transport: http(OG_RPC),
    });
    const receipt = await ogClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    if (receipt.status === "success") {
      confirmSpinner.succeed("Payment confirmed on-chain!");
      console.log(
        chalk.gray(`  Tx: ${BLOCK_EXPLORER}/tx/${txHash}`)
      );
      console.log();
      return true;
    } else {
      confirmSpinner.fail("Transaction reverted");
      return false;
    }
  } catch (err: any) {
    const msg = err.message ?? String(err);
    if (msg.includes("rejected") || msg.includes("denied")) {
      console.log(chalk.yellow("  Transaction rejected by user."));
    } else {
      console.log(chalk.red(`  WalletConnect error: ${msg}`));
    }
    console.log();
    return false;
  } finally {
    signClient = null;
    // Remove handler after a delay to catch late WC events
    setTimeout(() => process.off("uncaughtException", wcErrorHandler), 5000);
  }
}

export async function installCommand(
  packageSpec: string,
  auditSource: AuditSource,
  force: boolean = false
) {
  const atIndex = packageSpec.lastIndexOf("@");
  let packageName: string;
  let requestedVersion: string | null = null;

  if (atIndex > 0) {
    packageName = packageSpec.slice(0, atIndex);
    requestedVersion = packageSpec.slice(atIndex + 1);
  } else {
    packageName = packageSpec;
  }

  const spinner = ora(`Checking audit for ${packageName}...`).start();

  if (!requestedVersion) {
    try {
      const resp = await fetch(
        `https://registry.npmjs.org/${packageName}/latest`
      );
      if (resp.ok) {
        const data = await resp.json();
        requestedVersion = data.version;
      }
    } catch {
      // continue
    }
  }

  if (!requestedVersion) {
    spinner.fail("Could not determine package version.");
    return;
  }

  const audit = await auditSource.getAudit(packageName, requestedVersion);

  spinner.stop();

  console.log();
  console.log(chalk.bold(`  ${packageName}@${requestedVersion}`));
  console.log();

  // ─── No audit found ───────────────────────────────────────────────
  if (!audit) {
    console.log(
      chalk.gray(`  NOT AUDITED — no NpmGuard record found for this version.`)
    );
    console.log();

    const privateKey = process.env.NPMGUARD_PRIVATE_KEY;
    const contractDeployed = AUDIT_REQUEST_ADDRESS_0G !== ZERO_ADDRESS;

    if (contractDeployed) {
      const publicClient = createPublicClient({
        chain: ogGalileo,
        transport: http(OG_RPC),
      });

      // Check if user already paid (previous attempt where audit engine failed)
      let alreadyPaid = false;
      try {
        alreadyPaid = (await publicClient.readContract({
          address: AUDIT_REQUEST_ADDRESS_0G,
          abi: AUDIT_REQUEST_ABI,
          functionName: "isRequested",
          args: [packageName, requestedVersion],
        })) as boolean;
      } catch {
        // can't read — assume not paid
      }

      if (alreadyPaid) {
        console.log(chalk.cyan(`  Already paid on-chain — re-triggering audit...`));
        console.log();
      } else {
        // Read fee for display
        let feeDisplay = "0.01 0G";
        let feeWei = 10000000000000000n;
        try {
          feeWei = (await publicClient.readContract({
            address: AUDIT_REQUEST_ADDRESS_0G,
            abi: AUDIT_REQUEST_ABI,
            functionName: "auditFee",
          })) as bigint;
          feeDisplay = `${formatEther(feeWei)} 0G`;
        } catch {}

        const wantAudit = await prompt(
          chalk.yellow(`  Request on-chain audit for ${feeDisplay}? (y/n) `)
        );

        if (wantAudit !== "y" && wantAudit !== "yes") {
          return askInstallWithoutAudit(packageSpec);
        }

        // Ask how to pay
        console.log();
        console.log(chalk.bold(`  How to pay?`));
        if (privateKey) {
          console.log(`    1) Wallet (NPMGUARD_PRIVATE_KEY)`);
          console.log(`    2) WalletConnect (mobile wallet)`);
          console.log(`    3) Back`);
        } else {
          console.log(`    1) WalletConnect (mobile wallet)`);
          console.log(`    2) Back`);
        }
        console.log();
        const choice = await prompt(`  Choice: `);

        const backChoice = privateKey ? "3" : "2";
        if (choice === backChoice) {
          return askInstallWithoutAudit(packageSpec);
        }

        if (privateKey && choice === "1") {
          const txSpinner = ora("  Sending payment transaction...").start();
          try {
            const txHash = await requestAuditOnChain(packageName, requestedVersion, privateKey);
            txSpinner.succeed("Payment confirmed on-chain!");
            console.log(chalk.gray(`  Tx: ${BLOCK_EXPLORER}/tx/${txHash}`));
            console.log();
          } catch (err: any) {
            txSpinner.fail("Transaction failed");
            console.log(chalk.red(`  ${err.shortMessage ?? err.message}`));
            console.log();
            return askInstallWithoutAudit(packageSpec);
          }
        } else if ((privateKey && choice === "2") || (!privateKey && choice === "1")) {
          const paid = await payViaWalletConnect(
            packageName, requestedVersion, feeWei, feeDisplay
          );
          if (!paid) return askInstallWithoutAudit(packageSpec);
        } else {
          return askInstallWithoutAudit(packageSpec);
        }
      }

      // Trigger audit engine (streaming endpoint)
      const rawApiUrl = process.env.NPMGUARD_AUDIT_API_URL ?? DEFAULT_ENGINE_URL;
      const engineBaseUrl = rawApiUrl.replace(/\/audit\/?$/, "");
      const frontendUrl = process.env.NPMGUARD_FRONTEND_URL ?? engineBaseUrl;
      const auditSpinner = ora("  Running security audit...").start();

      try {
        const streamResp = await fetch(`${engineBaseUrl}/audit/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packageName, version: requestedVersion }),
        });

        if (!streamResp.ok) throw new Error(`Audit engine returned ${streamResp.status}`);

        const { auditId } = await streamResp.json();

        auditSpinner.text = "  Running security audit...";
        console.log();
        console.log(chalk.cyan(`  Live audit: ${frontendUrl}/audit/${auditId}`));
        console.log();

        // Poll for completion
        let result: any;
        const POLL_INTERVAL = 2000;
        const POLL_TIMEOUT = 5 * 60_000;
        const start = Date.now();

        while (Date.now() - start < POLL_TIMEOUT) {
          const reportResp = await fetch(`${engineBaseUrl}/audit/${auditId}/report`);
          if (reportResp.status === 202) {
            await new Promise((r) => setTimeout(r, POLL_INTERVAL));
            continue;
          }
          if (!reportResp.ok) throw new Error(`Audit engine returned ${reportResp.status}`);
          result = await reportResp.json();
          break;
        }

        auditSpinner.stop();

        if (!result) {
          throw new Error("Audit timed out");
        }

        console.log();
        const verdict = (result.verdict ?? "UNKNOWN").toUpperCase();
        const capabilities: string[] = result.capabilities ?? [];

        if (verdict === "SAFE") {
          console.log(chalk.green(`  Verdict: SAFE`));
        } else if (verdict === "DANGEROUS") {
          console.log(chalk.red(`  Verdict: DANGEROUS`));
        } else {
          console.log(chalk.yellow(`  Verdict: ${verdict}`));
        }

        if (capabilities.length > 0) {
          console.log(chalk.gray(`  Capabilities: ${capabilities.join(", ")}`));
        }
        console.log();

        if (verdict === "DANGEROUS" && !force) {
          console.log(chalk.red.bold("  Installation blocked. This package is dangerous."));
          console.log(chalk.gray("  Use --force to install anyway."));
          console.log();
          return;
        }

        console.log(chalk.gray("  Installing from npm..."));
        console.log();
        execSync(`npm install ${packageSpec}`, { stdio: "inherit" });
      } catch (err: any) {
        auditSpinner.fail("Audit engine unreachable");
        console.log(chalk.gray(`  ${err.message ?? err}`));
        console.log();
        return askInstallWithoutAudit(packageSpec);
      }
      return;
    }

    // Contract not deployed
    return askInstallWithoutAudit(packageSpec);
  }

  // ─── Audit found — show verdict ───────────────────────────────────
  if (audit.verdict === "SAFE") {
    console.log(chalk.green(`  SAFE (score: ${audit.score})`));
  } else if (audit.verdict === "WARNING") {
    console.log(chalk.yellow(`  WARNING (score: ${audit.score})`));
  } else if (audit.verdict === "CRITICAL" || audit.verdict === "DANGEROUS") {
    console.log(chalk.red(`  DANGEROUS (score: ${audit.score})`));
  }

  if (audit.capabilities.length > 0) {
    console.log(
      chalk.gray(`  Capabilities: ${audit.capabilities.join(", ")}`)
    );
  }

  if (audit.reportCid) {
    console.log(
      chalk.gray(`  Report: ${IPFS_GATEWAY}/${audit.reportCid}`)
    );
  }

  console.log();

  // Block CRITICAL/DANGEROUS unless --force
  if ((audit.verdict === "CRITICAL" || audit.verdict === "DANGEROUS") && !force) {
    console.log(
      chalk.red.bold(
        "  Installation blocked. This package has critical security issues."
      )
    );
    console.log(chalk.gray("  Use --force to install anyway."));
    console.log();
    return;
  }

  // Install from IPFS if sourceCid is available
  if (audit.sourceCid) {
    const ipfsUrl = `${IPFS_GATEWAY}/${audit.sourceCid}`;

    console.log(
      chalk.green(`  Installing from verified IPFS source...`)
    );
    console.log();

    try {
      execSync(`npm install ${ipfsUrl}`, { stdio: "inherit" });
    } catch {
      console.log(
        chalk.yellow("  IPFS install failed, falling back to npm...")
      );
      execSync(`npm install ${packageSpec}`, { stdio: "inherit" });
    }
  } else {
    console.log(chalk.gray("  No IPFS source available, installing from npm..."));
    console.log();
    execSync(`npm install ${packageSpec}`, { stdio: "inherit" });
  }
}
