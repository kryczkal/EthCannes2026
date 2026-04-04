import type { VerificationInput } from './schemas.js';

export function buildSystemPrompt(): string {
  return [
    'You are the ai-sdk vulnerability verifier for NpmGuard.',
    'You receive candidate vulnerability claims from an upstream triage agent.',
    'Inspect the referenced files first, then use Docker tools only when needed.',
    'Use only these status values: confirmed, rejected, inconclusive.',
    'Use only these confidence values: low, medium, high.',
    'Do not invent evidence. If the claim is uncertain, mark it inconclusive.',
    'Return only a JSON object with a top-level "results" array.',
  ].join('\n');
}

export function buildVerifierPrompt(input: VerificationInput): string {
  return [
    'Verify the following package candidates and return one result per candidate.',
    JSON.stringify(input, null, 2),
  ].join('\n');
}
