import chalk from "chalk";
import ora from "ora";
import { execSync } from "node:child_process";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AuditSource } from "../audit-source.js";

const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";

async function downloadFromIPFS(cid: string, dest: string): Promise<void> {
  const resp = await fetch(`${IPFS_GATEWAY}/${cid}`);
  if (!resp.ok) {
    throw new Error(`IPFS download failed: ${resp.status}`);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  await writeFile(dest, buffer);
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
    const dlSpinner = ora(
      `Downloading verified source from IPFS (${audit.sourceCid.slice(0, 12)}...)`,
    ).start();

    try {
      const tmpDir = join(tmpdir(), "npmguard");
      await mkdir(tmpDir, { recursive: true });
      const tarballPath = join(
        tmpDir,
        `${packageName}-${requestedVersion}.tgz`
      );

      await downloadFromIPFS(audit.sourceCid, tarballPath);
      dlSpinner.succeed("Downloaded from IPFS");

      console.log(
        chalk.green(`  Installing from verified IPFS source...`)
      );
      console.log();
      execSync(`npm install ${tarballPath}`, { stdio: "inherit" });

      // Fix package.json — replace the file: path with the real version
      try {
        const pkgPath = join(process.cwd(), "package.json");
        const pkgRaw = await readFile(pkgPath, "utf-8");
        const pkg = JSON.parse(pkgRaw);
        if (pkg.dependencies?.[packageName]?.startsWith("file:")) {
          pkg.dependencies[packageName] = `^${requestedVersion}`;
          await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
        }
      } catch {
        // Not critical if this fails
      }

      // Cleanup tarball
      await unlink(tarballPath).catch(() => {});
    } catch (err) {
      dlSpinner.fail("IPFS download failed");
      console.log(
        chalk.yellow("  Falling back to npm install...")
      );
      console.log();
      execSync(`npm install ${packageSpec}`, { stdio: "inherit" });
    }
  } else {
    // No sourceCid — install from npm
    console.log(chalk.gray("  No IPFS source available, installing from npm..."));
    console.log();
    execSync(`npm install ${packageSpec}`, { stdio: "inherit" });
  }
}
