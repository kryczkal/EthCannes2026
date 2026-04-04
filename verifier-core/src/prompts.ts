import type { VerificationInput } from './schemas.js';
import { TOOL_DESCRIPTIONS, type VerifierToolRuntime } from './verifier-tools.js';

export function buildSystemPrompt(verifierName: 'ai-sdk' | 'openclaw'): string {
  return [
    `You are the ${verifierName} vulnerability verifier for NpmGuard.`,
    'You receive a package plus candidate vulnerability claims from an upstream triage agent.',
    'Your job is to verify each candidate using bounded inspection tools and one Docker sandbox.',
    'Only use these status values: confirmed, rejected, inconclusive.',
    'Only use these confidence values: low, medium, high.',
    'Always inspect the referenced files first before using runtime tools.',
    'Do not invent evidence. If you cannot prove or disprove a claim, mark it inconclusive.',
    'Return only JSON in the final answer.',
  ].join('\n');
}

export function buildVerifierPrompt(input: VerificationInput): string {
  return [
    'Verify the following candidate vulnerabilities for this package.',
    'Read the referenced files, use runtime tools as needed, and return one result per candidate.',
    '',
    JSON.stringify(input, null, 2),
  ].join('\n');
}

export function buildOpenClawTurnPrompt(
  input: VerificationInput,
  conversation: Array<{ role: 'system' | 'user' | 'tool'; content: string }>,
): string {
  return [
    'You are running inside a bounded verification loop.',
    'Available tools:',
    JSON.stringify(TOOL_DESCRIPTIONS, null, 2),
    '',
    'When you need a tool, respond with JSON:',
    '{"type":"tool_call","tool":"read_file","input":{"filePath":"lib/telemetry.js"},"reason":"Explain why"}',
    '',
    'When you are done, respond with JSON:',
    '{"type":"final","results":[...]}',
    '',
    'Conversation so far:',
    JSON.stringify(conversation, null, 2),
    '',
    'Original input:',
    JSON.stringify(input, null, 2),
  ].join('\n');
}

export function buildInitialConversation(input: VerificationInput): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: buildSystemPrompt('openclaw') },
    { role: 'user', content: buildVerifierPrompt(input) },
  ];
}
