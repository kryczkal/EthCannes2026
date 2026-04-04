#!/usr/bin/env node
import { Command } from 'commander';

import { loadVerificationInput, writeVerificationOutput } from '../../verifier-core/src/index.js';
import { runAISDKVerifier } from './verifier.js';

const program = new Command();

program
  .name('verify-candidates')
  .requiredOption('--input <path>', 'Path to candidate JSON input')
  .option('--output <path>', 'Optional output file path');

program.parse(process.argv);

const options = program.opts<{ input: string; output?: string }>();

async function main() {
  const input = await loadVerificationInput(options.input);
  const output = await runAISDKVerifier(input);
  const json = `${JSON.stringify(output, null, 2)}\n`;

  if (options.output) {
    await writeVerificationOutput(options.output, output);
  }

  process.stdout.write(json);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
