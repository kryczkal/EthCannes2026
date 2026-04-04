import {
  buildInitialConversation,
  buildOpenClawTurnPrompt,
  CandidateResult,
  DockerSandbox,
  extractJsonObject,
  ToolLoopResponse,
  toolLoopResponseSchema,
  type VerificationInput,
  verificationOutputSchema,
  VerifierToolRuntime,
} from '../../verifier-core/src/index.js';
import { readOpenClawEnv } from './env.js';
import { OpenClawClient } from './openclaw-client.js';

async function executeToolStep(runtime: VerifierToolRuntime, step: Extract<ToolLoopResponse, { type: 'tool_call' }>): Promise<string> {
  switch (step.tool) {
    case 'list_files':
      return await runtime.list_files();
    case 'read_file':
      return await runtime.read_file(String(step.input.filePath));
    case 'search_in_files':
      return await runtime.search_in_files(String(step.input.pattern));
    case 'eval_js':
      return await runtime.eval_js(String(step.input.code));
    case 'require_and_trace':
      return await runtime.require_and_trace(String(step.input.entrypointOrFile));
    case 'run_npm_script':
      return await runtime.run_npm_script(String(step.input.scriptName));
    case 'fast_forward_timers':
      return await runtime.fast_forward_timers(
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

  const sandbox = new DockerSandbox({
    packageDir: input.package_dir,
  });

  await sandbox.start();

  try {
    const runtime = new VerifierToolRuntime({
      input,
      sandbox,
    });

    const conversation: Array<{ role: 'system' | 'user' | 'tool'; content: string }> = buildInitialConversation(input);

    for (let turn = 0; turn < env.maxTurns; turn += 1) {
      const prompt = buildOpenClawTurnPrompt(input, conversation);
      const raw = await client.complete(prompt);
      const step = toolLoopResponseSchema.parse(JSON.parse(extractJsonObject(raw))) as ToolLoopResponse;

      if (step.type === 'final') {
        const parsed = verificationOutputSchema.parse({
          package_name: input.package_name,
          package_version: input.package_version,
          verifier: 'openclaw',
          results: step.results,
        });

        const results: CandidateResult[] = parsed.results.map((entry) => ({
          ...entry,
          tool_trace: entry.tool_trace.length > 0 ? entry.tool_trace : runtime.snapshotTrace(),
        }));

        return {
          ...parsed,
          results,
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
