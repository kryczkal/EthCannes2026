import chalk from "chalk";
import ora from "ora";
import { createInterface } from "node:readline";
import { execSync } from "node:child_process";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { AuditSource } from "../audit-source.js";
import {
  AUDIT_REQUEST_ADDRESS,
  AUDIT_REQUEST_ABI,
} from "../contract.js";

const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const RPC_URLS = process.env.SEPOLIA_RPC_URL
  ? [process.env.SEPOLIA_RPC_URL]
  : [
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://rpc.sepolia.org",
      "https://sepolia.drpc.org",
    ];

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
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
  const rpcUrl = RPC_URLS[0];

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });

  // Read the current audit fee from the contract
  const auditFee = await publicClient.readContract({
    address: AUDIT_REQUEST_ADDRESS,
    abi: AUDIT_REQUEST_ABI,
    functionName: "auditFee",
  });

  const hash = await walletClient.writeContract({
    address: AUDIT_REQUEST_ADDRESS,
    abi: AUDIT_REQUEST_ABI,
    functionName: "requestAudit",
    args: [packageName, version],
    value: auditFee,
  });

  await publicClient.waitForTransactionReceipt({ hash });

  return hash;
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
    const contractDeployed = AUDIT_REQUEST_ADDRESS !== ZERO_ADDRESS;

    if (privateKey && contractDeployed) {
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(RPC_URLS[0]),
      });

      // Check if user already paid (previous attempt where audit engine failed)
      let alreadyPaid = false;
      try {
        alreadyPaid = (await publicClient.readContract({
          address: AUDIT_REQUEST_ADDRESS,
          abi: AUDIT_REQUEST_ABI,
          functionName: "isRequested",
          args: [packageName, requestedVersion],
        })) as boolean;
      } catch {
        // can't read — assume not paid
      }

      if (alreadyPaid) {
        // Already paid — skip payment, go straight to audit
        console.log(chalk.cyan(`  Already paid on-chain — re-triggering audit...`));
        console.log();
      } else {
        // Ask user to pay
        let feeDisplay = "0.001 ETH";
        try {
          const fee = await publicClient.readContract({
            address: AUDIT_REQUEST_ADDRESS,
            abi: AUDIT_REQUEST_ABI,
            functionName: "auditFee",
          });
          feeDisplay = `${formatEther(fee)} ETH`;
        } catch {}

        const answer = await prompt(
          chalk.yellow(`  Request on-chain audit for ${feeDisplay}? (y/n) `)
        );

        if (answer !== "y" && answer !== "yes") {
          return askInstallWithoutAudit(packageSpec);
        }

        // Pay on-chain
        const txSpinner = ora("  Sending payment transaction...").start();
        try {
          const txHash = await requestAuditOnChain(packageName, requestedVersion, privateKey);
          txSpinner.succeed("Payment confirmed on-chain!");
          console.log(chalk.gray(`  Tx: https://sepolia.etherscan.io/tx/${txHash}`));
          console.log();
        } catch (err: any) {
          txSpinner.fail("Transaction failed");
          console.log(chalk.red(`  ${err.shortMessage ?? err.message}`));
          console.log();
          return askInstallWithoutAudit(packageSpec);
        }
      }

      // Trigger audit engine (runs whether first attempt or retry)
      const auditApiUrl = process.env.NPMGUARD_AUDIT_API_URL ?? "http://localhost:8000/audit";
      const auditSpinner = ora("  Running security audit...").start();

      try {
        const resp = await fetch(auditApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ package_name: packageName }),
        });

        if (!resp.ok) throw new Error(`Audit engine returned ${resp.status}`);

        const result = await resp.json();
        auditSpinner.stop();

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

    // No private key or contract not deployed
    if (!contractDeployed) {
      // skip silently
    } else {
      console.log(chalk.gray(`  Set NPMGUARD_PRIVATE_KEY to request an on-chain audit.`));
      console.log();
    }

    return askInstallWithoutAudit(packageSpec);
  }

  // ─── Audit found — show verdict ───────────────────────────────────
  if (audit.verdict === "SAFE") {
    console.log(chalk.green(`  SAFE (score: ${audit.score})`));
  } else if (audit.verdict === "WARNING") {
    console.log(chalk.yellow(`  WARNING (score: ${audit.score})`));
  } else if (audit.verdict === "CRITICAL") {
    console.log(chalk.red(`  CRITICAL (score: ${audit.score})`));
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

  // Block CRITICAL unless --force
  if (audit.verdict === "CRITICAL" && !force) {
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
    // No sourceCid — install from npm
    console.log(chalk.gray("  No IPFS source available, installing from npm..."));
    console.log();
    execSync(`npm install ${packageSpec}`, { stdio: "inherit" });
  }
}
