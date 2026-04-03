import chalk from "chalk";
import ora from "ora";
import { execSync } from "node:child_process";
import type { AuditSource } from "../audit-source.js";

export async function installCommand(
  packageSpec: string,
  auditSource: AuditSource
) {
  // Parse package@version or just package
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

  // Get latest version from npm if not specified
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
      // continue without version
    }
  }

  if (!requestedVersion) {
    spinner.fail("Could not determine package version.");
    return;
  }

  const audit = await auditSource.getAudit(packageName, requestedVersion);

  spinner.stop();

  if (!audit) {
    console.log();
    console.log(
      chalk.gray(
        `  ❓ ${packageName}@${requestedVersion} has not been audited by NpmGuard.`
      )
    );
    console.log(chalk.gray("  Proceeding with standard npm install..."));
    console.log();
    execSync(`npm install ${packageSpec}`, { stdio: "inherit" });
    return;
  }

  console.log();
  console.log(chalk.bold(`  📦 ${packageName}@${requestedVersion}`));
  console.log();

  if (audit.verdict === "SAFE") {
    console.log(chalk.green(`  ✅ SAFE (score: ${audit.score})`));
    if (audit.capabilities.length > 0) {
      console.log(
        chalk.gray(`  Capabilities: ${audit.capabilities.join(", ")}`)
      );
    }
    console.log();
    execSync(`npm install ${packageSpec}`, { stdio: "inherit" });
  } else if (audit.verdict === "WARNING") {
    console.log(chalk.yellow(`  ⚠️  WARNING (score: ${audit.score})`));
    console.log(
      chalk.yellow(
        `  Capabilities: ${audit.capabilities.join(", ")}`
      )
    );
    if (audit.reportCid) {
      console.log(
        chalk.gray(
          `  Report: https://gateway.pinata.cloud/ipfs/${audit.reportCid}`
        )
      );
    }
    console.log();
    console.log(chalk.yellow("  Installing with warning..."));
    console.log();
    execSync(`npm install ${packageSpec}`, { stdio: "inherit" });
  } else if (audit.verdict === "CRITICAL") {
    console.log(chalk.red(`  ❌ CRITICAL (score: ${audit.score})`));
    console.log(
      chalk.red(`  Capabilities: ${audit.capabilities.join(", ")}`)
    );
    if (audit.reportCid) {
      console.log(
        chalk.gray(
          `  Report: https://gateway.pinata.cloud/ipfs/${audit.reportCid}`
        )
      );
    }
    console.log();
    console.log(
      chalk.red.bold(
        "  ⛔ Installation blocked. This package has critical security issues."
      )
    );
    console.log(
      chalk.gray(
        "  Use --force to install anyway: npmguard install --force " +
          packageSpec
      )
    );
    console.log();
  }
}
