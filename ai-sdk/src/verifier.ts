import { generateText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

import { DockerSandbox } from './docker.js';
import { readAISDKEnv } from './env.js';
import { buildSystemPrompt, buildVerifierPrompt } from './prompt.js';
import { extractJsonObject } from './text.js';
import type { VerificationInput } from './schemas.js';
import { verificationOutputSchema } from './schemas.js';
import { AISDKToolRuntime, buildAISDKTools } from './tools.js';

export async function runAISDKVerifier(input: VerificationInput) {
  const env = readAISDKEnv();
  const provider = createOpenAI({
    apiKey: env.apiKey,
    baseURL: env.baseURL,
  });

  const sandbox = new DockerSandbox({
    input.package_dir,
  });

  await sandbox.start();

  try {
    const runtime = new AISDKToolRuntime(input, sandbox);

    const result = await generateText({
      model: provider(env.model),
      system: buildSystemPrompt(),
      prompt: buildVerifierPrompt(input),
      tools: buildAISDKTools(runtime),
      maxSteps: env.maxSteps,
    });

    const parsed = verificationOutputSchema.parse({
      ...JSON.parse(extractJsonObject(result.text)),
      package_name: input.package_name,
      package_version: input.package_version,
      verifier: 'ai-sdk',
    });

    return {
      ...parsed,
      results: parsed.results.map((entry) => ({
        ...entry,
        tool_trace: entry.tool_trace.length > 0 ? entry.tool_trace : [...runtime.toolTrace],
      })),
    };
  } finally {
    await sandbox.stop();
  }
}
