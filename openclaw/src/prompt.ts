import type { VerificationInput } from './schemas.js';
import { TOOL_DESCRIPTIONS } from './tools.js';

export function buildConversation(input: VerificationInput) {
  return [
    {
      role: 'system' as const,
      content: [
        'You are the OpenClaw vulnerability verifier for NpmGuard.',
        'You receive candidate vulnerability claims from an upstream triage agent.',
        'Inspect the referenced files first, then use runtime tools only when needed.',
        'Every response must be exactly one JSON object. Do not output prose, Markdown, or code fences.',
        'Use only these status values: confirmed, rejected, inconclusive.',
        'Use only these confidence values: low, medium, high.',
        'Do not invent evidence.',
      ].join('\n'),
    },
    {
      role: 'user' as const,
      content: JSON.stringify(input, null, 2),
    },
  ];
}

export function buildTurnPrompt(
  input: VerificationInput,
  conversation: Array<{ role: 'system' | 'user' | 'tool'; content: string }>,
) {
  return [
    'You are running inside a bounded verification loop.',
    'Reply with exactly one JSON object and nothing else.',
    'Do not explain your plan in natural language.',
    'Do not wrap JSON in Markdown fences.',
    'If you need more information, emit a tool_call JSON object.',
    'Available tools:',
    JSON.stringify(TOOL_DESCRIPTIONS, null, 2),
    '',
    'When you need a tool, respond with JSON:',
    '{"type":"tool_call","tool":"read_file","input":{"filePath":"lib/telemetry.js"},"reason":"Explain why"}',
    '',
    'When you are done, respond with JSON:',
    '{"type":"final","results":[{"id":"cand-001","status":"confirmed","confidence":"high","normalized_capability":"network_exfiltration","evidence":["fact 1","fact 2"],"rationale":"Explain the decision"}]}',
    '',
    'Conversation so far:',
    JSON.stringify(conversation, null, 2),
    '',
    'Original input:',
    JSON.stringify(input, null, 2),
  ].join('\n');
}
