import { DockerSandbox } from './docker.js';
import { readOpenClawEnv } from './env.js';
import { buildTestGenConversation, buildTestGenTurnPrompt } from './test-gen-prompt.js';
import {
  generatedTestSchema,
  type TestGenInput,
  type TestGenOutput,
  type TestGenToolLoopResponse,
  testGenToolLoopResponseSchema,
  testGenOutputSchema,
} from './schemas.js';
import { extractJsonObject } from './text.js';
import { OpenClawToolRuntime } from './tools.js';
import { OpenClawClient } from './openclaw-client.js';

function normalizeTestGenResults(input: TestGenInput, rawTests: unknown): TestGenOutput['tests'] {
  if (!Array.isArray(rawTests)) {
    throw new Error('OpenClaw test-gen final response did not contain a tests array.');
  }

  const findingIds = new Set(input.findings.map((f) => f.id));

  return rawTests
    .map((raw) => {
      const entry = (raw ?? {}) as Record<string, unknown>;
      const findingId = String(entry.finding_id ?? '');

      if (!findingIds.has(findingId)) {
        process.stderr.write(`[test-gen] warning: unknown finding_id "${findingId}", skipping\n`);
        return null;
      }

      // Strip markdown fences if the LLM wrapped the code
      let testCode = String(entry.test_code ?? '');
      testCode = testCode.replace(/^```(?:javascript|js)?\n?/m, '').replace(/\n?```\s*$/m, '');

      return generatedTestSchema.parse({
        finding_id: findingId,
        test_code: testCode,
        entry_point: typeof entry.entry_point === 'string' ? entry.entry_point : '',
        rationale: typeof entry.rationale === 'string' ? entry.rationale : '',
      });
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);
}

async function executeToolStep(
  runtime: OpenClawToolRuntime,
  step: Extract<TestGenToolLoopResponse, { type: 'tool_call' }>,
): Promise<string> {
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

export async function runOpenClawTestGen(input: TestGenInput): Promise<TestGenOutput> {
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
    // Adapt test-gen input to the shape OpenClawToolRuntime expects
    const runtimeInput = {
      package_dir: input.package_dir,
      package_name: input.package_name,
      package_version: input.package_version,
      candidates: input.findings.map((f) => ({
        id: f.id,
        file_name: f.fileLine.split(':')[0] || '',
        where: f.fileLine.split(':')[1] || '1-999',
        potential_vulnerability: f.problem,
      })),
    };

    const runtime = new OpenClawToolRuntime(runtimeInput, sandbox);
    const conversation: Array<{ role: 'system' | 'user' | 'tool'; content: string }> =
      buildTestGenConversation(input);

    for (let turn = 0; turn < env.maxTurns; turn += 1) {
      const prompt = buildTestGenTurnPrompt(input, conversation);
      const raw = await client.complete(prompt);
      process.stderr.write(`\n[test-gen raw turn ${turn + 1}]\n${raw.slice(0, 500)}...\n\n`);

      const parsedRaw = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
      const step = (
        parsedRaw.type === 'final'
          ? {
              type: 'final' as const,
              tests: normalizeTestGenResults(input, parsedRaw.tests),
            }
          : parsedRaw
      ) as TestGenToolLoopResponse;
      testGenToolLoopResponseSchema.parse(step);

      if (step.type === 'final') {
        return testGenOutputSchema.parse({
          package_name: input.package_name,
          tests: step.tests,
        });
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

    throw new Error(`OpenClaw test-gen exhausted ${env.maxTurns} turns without a final result.`);
  } finally {
    await sandbox.stop();
  }
}
