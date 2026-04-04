#!/usr/bin/env node
import { Command } from 'commander';
import { promises as fs } from 'node:fs';

import { loadVerificationInput, writeVerificationOutput } from './io.js';
import { runOpenClawVerifier } from './verifier.js';
import { runOpenClawTestGen } from './test-gen-mode.js';
import { testGenInputSchema } from './schemas.js';

const program = new Command();

program
  .name('openclaw')
  .requiredOption('--input <path>', 'Path to candidate JSON input')
  .option('--output <path>', 'Optional output file path')
  .option('--mode <mode>', 'Mode: "verify" (default) or "test-gen"', 'verify');

program.parse(process.argv);

const options = program.opts<{ input: string; output?: string; mode: string }>();

async function main() {
  if (options.mode === 'test-gen') {
    const raw = JSON.parse(await fs.readFile(options.input, 'utf8'));
    const input = testGenInputSchema.parse(raw);
    const output = await runOpenClawTestGen(input);
    const json = `${JSON.stringify(output, null, 2)}\n`;

    if (options.output) {
      await fs.writeFile(options.output, json, 'utf8');
    }

    process.stdout.write(json);
  } else {
    const input = await loadVerificationInput(options.input);
    const output = await runOpenClawVerifier(input);
    const json = `${JSON.stringify(output, null, 2)}\n`;

    if (options.output) {
      await writeVerificationOutput(options.output, output);
    }

    process.stdout.write(json);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
