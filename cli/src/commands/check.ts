import chalk from "chalk";
import Table from "cli-table3";
import ora from "ora";
import { scanProject } from "../scanner.js";
import type { AuditSource, AuditResult } from "../audit-source.js";

const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";

function verdictLabel(verdict: string, score: number): string {
  switch (verdict) {
    case "SAFE":
      return chalk.green(`SAFE (${score})`);
    case "WARNING":
      return chalk.yellow(`WARNING (${score})`);
    case "CRITICAL":
      return chalk.red(`CRITICAL (${score})`);
    default:
      return chalk.gray("UNKNOWN");
  }
}

function capsLabel(caps: string[]): string {
  if (caps.length === 0) return chalk.gray("none");
  return caps
    .map((c) => {
      if (["process_spawn", "binary_download", "eval_usage", "obfuscated_code"].includes(c)) {
        return chalk.red(c);
      }
      if (["filesystem"].includes(c)) {
        return chalk.yellow(c);
      }
      return chalk.gray(c);
    })
    .join(", ");
}

function shortCid(cid: string): string {
  return cid.slice(0, 8) + "..." + cid.slice(-4);
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
      chalk.bold("Verdict"),
      chalk.bold("Capabilities"),
    ],
    style: { head: [], border: [] },
  });

  let safeCount = 0;
  let warningCount = 0;
  let criticalCount = 0;
  let notAuditedCount = 0;
  const links: string[] = [];

  for (const dep of deps) {
    const versionToCheck = dep.latest ?? dep.installed;
    let audit: AuditResult | null;

    if (!dep.hasUpdate) {
      audit = await auditSource.getAudit(dep.name, dep.installed);
    } else {
      audit = await auditSource.getAudit(dep.name, versionToCheck);
    }

    let verdictCol: string;
    let capsCol: string;
    if (audit) {
      verdictCol = verdictLabel(audit.verdict, audit.score);
      capsCol = capsLabel(audit.capabilities);

      if (audit.verdict === "SAFE") safeCount++;
      else if (audit.verdict === "WARNING") warningCount++;
      else if (audit.verdict === "CRITICAL") criticalCount++;

      if (audit.reportCid) {
        links.push(
          `  ${dep.name}@${versionToCheck} report: ${IPFS_GATEWAY}/${audit.reportCid}`
        );
      }
    } else {
      verdictCol = chalk.gray("NOT AUDITED");
      capsCol = chalk.gray("-");
      notAuditedCount++;
    }

    table.push([
      dep.name,
      dep.installed,
      dep.latest ?? dep.installed,
      verdictCol,
      capsCol,
    ]);
  }

  spinner.stop();

  console.log();
  console.log(chalk.bold("NpmGuard Dependency Audit"));
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

  console.log(`  ${parts.join(" | ")}`);

  if (links.length > 0) {
    console.log();
    for (const link of links) {
      console.log(chalk.gray(link));
    }
  }

  if (criticalCount > 0) {
    console.log();
    console.log(
      chalk.red.bold(
        `  ${criticalCount} package(s) flagged as CRITICAL — do not update without reviewing the report.`
      )
    );
  }

  console.log();
}
