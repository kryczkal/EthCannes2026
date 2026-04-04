import { DockerSandbox } from './docker.js';
import { readOpenClawEnv } from './env.js';
import { buildConversation, buildTurnPrompt } from './prompt.js';
import {
  candidateResultSchema,
  type ToolLoopResponse,
  type VerificationInput,
  toolLoopResponseSchema,
  verificationOutputSchema,
} from './schemas.js';
import { extractJsonObject } from './text.js';
import { OpenClawToolRuntime } from './tools.js';
import { OpenClawClient } from './openclaw-client.js';

function normalizeEvidence(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter((entry) => entry.length > 0);
  }

  if (typeof value === 'string') {
    return value.length > 0 ? [value] : [];
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => {
        if (typeof entry === 'string') {
          return `${key}: ${entry}`;
        }

        return `${key}: ${JSON.stringify(entry)}`;
      })
      .filter((entry) => entry.length > 0);
  }

  return [];
}

function normalizeFinalResults(input: VerificationInput, results: unknown) {
  if (!Array.isArray(results)) {
    throw new Error('OpenClaw final response did not contain a results array.');
  }

  const candidatesById = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));

  return results.map((rawEntry) => {
    const entry = (rawEntry ?? {}) as Record<string, unknown>;
    const id = String(entry.id ?? '');
    const candidate = candidatesById.get(id);

    if (!candidate) {
      throw new Error(`OpenClaw final response referenced unknown candidate id: ${id || '(empty)'}`);
    }

    const evidence = normalizeEvidence(entry.evidence);
    const rationale =
      typeof entry.rationale === 'string' && entry.rationale.length > 0
        ? entry.rationale
        : evidence.join('\n') || 'No rationale provided.';

    return candidateResultSchema.parse({
      id: candidate.id,
      status: entry.status,
      confidence: entry.confidence,
      file_name: candidate.file_name,
      where: candidate.where,
      potential_vulnerability: candidate.potential_vulnerability,
      normalized_capability:
        typeof entry.normalized_capability === 'string' && entry.normalized_capability.length > 0
          ? entry.normalized_capability
          : null,
      evidence,
      tool_trace: Array.isArray(entry.tool_trace) ? entry.tool_trace.map((item) => String(item)) : [],
      rationale,
    });
  });
}

async function executeToolStep(runtime: OpenClawToolRuntime, step: Extract<ToolLoopResponse, { type: 'tool_call' }>): Promise<string> {
  switch (step.tool) {
    case 'list_files':
      return await runtime.listFiles();
    case 'read_file':
      return await runtime.readFile(String(step.input.filePath));
    case 'search_in_files':
      return await runtime.searchInFiles(String(step.input.pattern));
    case 'eval_js':
      return await runtime.evalJs(String(step.input.code));
    case 'require_and_trace':
      return await runtime.requireAndTrace(String(step.input.entrypointOrFile));
    case 'run_npm_script':
      return await runtime.runNpmScript(String(step.input.scriptName));
    case 'fast_forward_timers':
      return await runtime.fastForwardTimers(
        String(step.input.entrypointOrFile),
        Number(step.input.advanceMs ?? 0),
      );
    default:
      throw new Error(`Unsupported tool: ${(step as { tool: string }).tool}`);
  }
}

export async function runOpenClawVerifier(input: VerificationInput) {
  const env = readOpenClawEnv();
  const client = new OpenClawClient({
    command: env.command,
    args: env.args,
  });

  const sandbox = new DockerSandbox(input.package_dir);

  if (env.resetBeforeRun && env.resetSessionKey) {
    await client.resetSession(env.resetSessionKey);
  }

  await sandbox.start();

  try {
    const runtime = new OpenClawToolRuntime(input, sandbox);

    const conversation: Array<{ role: 'system' | 'user' | 'tool'; content: string }> = buildConversation(input);

    for (let turn = 0; turn < env.maxTurns; turn += 1) {
      const prompt = buildTurnPrompt(input, conversation);
      const raw = await client.complete(prompt);
      process.stderr.write(`\n[openclaw raw turn ${turn + 1}]\n${raw}\n\n`);
      const parsedRaw = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
      const step = (
        parsedRaw.type === 'final'
          ? {
              type: 'final',
              results: normalizeFinalResults(input, parsedRaw.results),
            }
          : parsedRaw
      ) as ToolLoopResponse;
      toolLoopResponseSchema.parse(step);

      if (step.type === 'final') {
        const parsed = verificationOutputSchema.parse({
          package_name: input.package_name,
          package_version: input.package_version,
          verifier: 'openclaw',
          results: step.results,
        });

        return {
          ...parsed,
          results: parsed.results.map((entry) => ({
            ...entry,
            tool_trace: entry.tool_trace.length > 0 ? entry.tool_trace : [...runtime.toolTrace],
          })),
        };
      }

      const toolResult = await executeToolStep(runtime, step);
      conversation.push({
        role: 'tool',
        content: JSON.stringify(
          {
            tool: step.tool,
            reason: step.reason,
            result: toolResult,
          },
          null,
          2,
        ),
      });
    }

    throw new Error(`OpenClaw verifier exhausted ${env.maxTurns} turns without a final result.`);
  } finally {
    await sandbox.stop();
  }
}
