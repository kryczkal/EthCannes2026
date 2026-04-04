#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import { resolve } from "node:path";
import { ENSAuditSource } from "./ens-source.js";
import { MockAuditSource } from "./mock-source.js";
import { checkCommand } from "./commands/check.js";
import { installCommand } from "./commands/install.js";

const program = new Command();

program
  .name("npmguard")
  .description("Check npm packages against NpmGuard security audits")
  .version("0.1.0");

program
  .command("check")
  .description(
    "Scan project dependencies and check audit status for available updates"
  )
  .option("-p, --path <path>", "Path to project directory", ".")
  .option("--mock", "Use mock data instead of ENS")
  .action(async (opts) => {
    const auditSource = opts.mock
      ? new MockAuditSource()
      : new ENSAuditSource();
    const projectPath = resolve(opts.path);
    await checkCommand(projectPath, auditSource);
  });

program
  .command("install <package>")
  .description("Install a package after checking its NpmGuard audit status")
  .option("--force", "Install even if flagged as CRITICAL")
  .option("--mock", "Use mock data instead of ENS")
  .action(async (pkg, opts) => {
    const auditSource = opts.mock
      ? new MockAuditSource()
      : new ENSAuditSource();
    await installCommand(pkg, auditSource, opts.force ?? false);
  });

program.parse();
