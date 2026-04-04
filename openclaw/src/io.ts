import { promises as fs } from 'node:fs';
import path from 'node:path';

import { verificationInputSchema, verificationOutputSchema, type VerificationInput, type VerificationOutput } from './schemas.js';

export async function loadVerificationInput(filePath: string): Promise<VerificationInput> {
  const raw = await fs.readFile(filePath, 'utf8');
  return verificationInputSchema.parse(JSON.parse(raw) as unknown);
}

export async function writeVerificationOutput(filePath: string, output: VerificationOutput): Promise<void> {
  const normalized = verificationOutputSchema.parse(output);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
}
