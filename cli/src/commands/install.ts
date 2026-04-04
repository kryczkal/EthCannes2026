import chalk from "chalk";
import ora from "ora";
import { execSync } from "node:child_process";
import type { AuditSource } from "../audit-source.js";

const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";

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

  // No audit found — fallback to npm
  if (!audit) {
    console.log(
      chalk.gray(`  NOT AUDITED — no NpmGuard record found for this version.`)
    );
    console.log();
    console.log(chalk.gray("  Falling back to npm install..."));
    console.log();
    execSync(`npm install ${packageSpec}`, { stdio: "inherit" });
    return;
  }

  // Show verdict
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
