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

  if (!audit) {
    console.log(
      chalk.gray(
        `  NOT AUDITED — no NpmGuard record found for this version.`
      )
    );
    console.log(
      chalk.gray(
        `  https://www.npmjs.com/package/${packageName}/v/${requestedVersion}`
      )
    );
    console.log();
    console.log(chalk.gray("  Proceeding with standard npm install..."));
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

  // Show capabilities
  if (audit.capabilities.length > 0) {
    console.log(
      chalk.gray(`  Capabilities: ${audit.capabilities.join(", ")}`)
    );
  }

  // Show IPFS links
  if (audit.reportCid) {
    console.log(
      chalk.gray(`  Report: ${IPFS_GATEWAY}/${audit.reportCid}`)
    );
  }
  if (audit.sourceCid) {
    console.log(
      chalk.gray(`  Source: ${IPFS_GATEWAY}/${audit.sourceCid}`)
    );
  }

  console.log();

  if (audit.verdict === "SAFE") {
    execSync(`npm install ${packageSpec}`, { stdio: "inherit" });
  } else if (audit.verdict === "WARNING") {
    console.log(chalk.yellow("  Installing with warning..."));
    console.log();
    execSync(`npm install ${packageSpec}`, { stdio: "inherit" });
  } else if (audit.verdict === "CRITICAL") {
    if (force) {
      console.log(chalk.red("  --force: Installing despite CRITICAL verdict..."));
      console.log();
      execSync(`npm install ${packageSpec}`, { stdio: "inherit" });
    } else {
      console.log(
        chalk.red.bold(
          "  Installation blocked. This package has critical security issues."
        )
      );
      console.log(
        chalk.gray(
          "  Use --force to install anyway."
        )
      );
      console.log();
    }
  }
}
