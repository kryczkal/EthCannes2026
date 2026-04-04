import { randomUUID } from 'node:crypto';

import { DockerSandbox } from './docker.js';
import { readOpenClawEnv } from './env.js';
import { buildConversation, buildTurnPrompt } from './prompt.js';
import {
  type ToolLoopResponse,
  type VerificationInput,
  toolLoopResponseSchema,
  verificationOutputSchema,
} from './schemas.js';
import { extractJsonObject } from './text.js';
import { OpenClawToolRuntime } from './tools.js';
import { OpenClawClient } from './openclaw-client.js';

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
  const sessionId = env.sessionId ?? randomUUID();
  const client = new OpenClawClient({
    command: env.command,
    args: env.args,
    sessionId,
  });

  const sandbox = new DockerSandbox(input.package_dir);

  await sandbox.start();

  try {
    const runtime = new OpenClawToolRuntime(input, sandbox);

    const conversation: Array<{ role: 'system' | 'user' | 'tool'; content: string }> = buildConversation(input);

    for (let turn = 0; turn < env.maxTurns; turn += 1) {
      const prompt = buildTurnPrompt(input, conversation);
      const raw = await client.complete(prompt);
      process.stderr.write(`\n[openclaw raw turn ${turn + 1}]\n${raw}\n\n`);
      const step = toolLoopResponseSchema.parse(JSON.parse(extractJsonObject(raw))) as ToolLoopResponse;

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
