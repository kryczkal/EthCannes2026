import chalk from "chalk";
import Table from "cli-table3";
import ora from "ora";
import { scanProject } from "../scanner.js";
import type { AuditSource, AuditResult } from "../audit-source.js";

function verdictLabel(verdict: string, score: number): string {
  switch (verdict) {
    case "SAFE":
      return chalk.green(`✅ SAFE (${score})`);
    case "WARNING":
      return chalk.yellow(`⚠️  WARNING (${score})`);
    case "CRITICAL":
      return chalk.red(`❌ CRITICAL (${score})`);
    default:
      return chalk.gray("❓ UNKNOWN");
  }
}

function reportLink(audit: AuditResult): string {
  if (audit.reportCid) {
    return chalk.gray(
      `  📄 Report: https://gateway.pinata.cloud/ipfs/${audit.reportCid}`
    );
  }
  return "";
}

function npmLink(name: string, version: string): string {
  return chalk.gray(
    `  📦 https://www.npmjs.com/package/${name}/v/${version}`
  );
}

export async function checkCommand(
  projectPath: string,
  auditSource: AuditSource
) {
  const spinner = ora("Scanning project dependencies...").start();

  const deps = await scanProject(projectPath);
  spinner.text = `Found ${deps.length} dependencies. Checking audits...`;

  const table = new Table({
    head: [
      chalk.bold("Package"),
      chalk.bold("Installed"),
      chalk.bold("Latest"),
      chalk.bold("NpmGuard Verdict"),
    ],
    style: { head: [], border: [] },
  });

  let safeCount = 0;
  let warningCount = 0;
  let criticalCount = 0;
  let notAuditedCount = 0;
  const details: string[] = [];

  for (const dep of deps) {
    const versionToCheck = dep.latest ?? dep.installed;
    const audit = await auditSource.getAudit(dep.name, versionToCheck);

    let verdictCol: string;
    if (!dep.hasUpdate) {
      const currentAudit = await auditSource.getAudit(
        dep.name,
        dep.installed
      );
      if (currentAudit) {
        verdictCol = verdictLabel(currentAudit.verdict, currentAudit.score);
        if (currentAudit.verdict === "SAFE") safeCount++;
        else if (currentAudit.verdict === "WARNING") {
          warningCount++;
          details.push(reportLink(currentAudit));
        } else if (currentAudit.verdict === "CRITICAL") {
          criticalCount++;
          details.push(reportLink(currentAudit));
        }
      } else {
        verdictCol = chalk.gray("❓ NOT AUDITED");
        notAuditedCount++;
        details.push(npmLink(dep.name, dep.installed));
      }
    } else if (audit) {
      verdictCol = verdictLabel(audit.verdict, audit.score);
      if (audit.verdict === "SAFE") safeCount++;
      else if (audit.verdict === "WARNING") {
        warningCount++;
        details.push(reportLink(audit));
      } else if (audit.verdict === "CRITICAL") {
        criticalCount++;
        details.push(reportLink(audit));
      }
    } else {
      verdictCol = chalk.gray("❓ NOT AUDITED");
      notAuditedCount++;
      details.push(npmLink(dep.name, versionToCheck));
    }

    table.push([
      dep.name,
      dep.installed,
      dep.latest ?? dep.installed,
      verdictCol,
    ]);
  }

  spinner.stop();

  console.log();
  console.log(chalk.bold("📦 NpmGuard Dependency Audit"));
  console.log();
  console.log(table.toString());
  console.log();

  // Summary
  const parts: string[] = [];
  if (safeCount > 0) parts.push(chalk.green(`${safeCount} safe`));
  if (warningCount > 0) parts.push(chalk.yellow(`${warningCount} warnings`));
  if (criticalCount > 0) parts.push(chalk.red(`${criticalCount} critical`));
  if (notAuditedCount > 0)
    parts.push(chalk.gray(`${notAuditedCount} not audited`));

  console.log(`  ${parts.join(" · ")}`);

  // Show detail links
  if (details.length > 0) {
    console.log();
    for (const d of details) {
      if (d) console.log(d);
    }
  }

  if (criticalCount > 0) {
    console.log();
    console.log(
      chalk.red.bold(
        `  ⛔ ${criticalCount} package(s) flagged as CRITICAL — do not update without reviewing the report.`
      )
    );
  }

  console.log();
}
