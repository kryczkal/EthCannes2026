import { generateText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

import {
  buildSystemPrompt,
  buildVerifierPrompt,
  CandidateResult,
  DockerSandbox,
  extractJsonObject,
  type VerificationInput,
  verificationOutputSchema,
  VerifierToolRuntime,
} from '../../verifier-core/src/index.js';
import { readAISDKEnv } from './env.js';

function buildTools(runtime: VerifierToolRuntime) {
  return {
    list_files: tool({
      description: 'List package files with size and type.',
      inputSchema: z.object({}),
      execute: async () => await runtime.list_files(),
    }),
    read_file: tool({
      description: 'Read a text file from the package.',
      inputSchema: z.object({ filePath: z.string().min(1) }),
      execute: async ({ filePath }) => await runtime.read_file(filePath),
    }),
    search_in_files: tool({
      description: 'Search package text files using a regex pattern.',
      inputSchema: z.object({ pattern: z.string().min(1) }),
      execute: async ({ pattern }) => await runtime.search_in_files(pattern),
    }),
    eval_js: tool({
      description: 'Execute a JavaScript snippet inside the Docker sandbox.',
      inputSchema: z.object({ code: z.string().min(1) }),
      execute: async ({ code }) => await runtime.eval_js(code),
    }),
    require_and_trace: tool({
      description: 'Require a package file with instrumentation enabled and return the trace log.',
      inputSchema: z.object({ entrypointOrFile: z.string().min(1) }),
      execute: async ({ entrypointOrFile }) => await runtime.require_and_trace(entrypointOrFile),
    }),
    run_npm_script: tool({
      description: 'Run one npm script with instrumentation enabled.',
      inputSchema: z.object({ scriptName: z.string().min(1) }),
      execute: async ({ scriptName }) => await runtime.run_npm_script(scriptName),
    }),
    fast_forward_timers: tool({
      description: 'Load a file and advance fake timers to trigger delayed behavior.',
      inputSchema: z.object({
        entrypointOrFile: z.string().min(1),
        advanceMs: z.number().int().nonnegative(),
      }),
      execute: async ({ entrypointOrFile, advanceMs }) =>
        await runtime.fast_forward_timers(entrypointOrFile, advanceMs),
    }),
  };
}

export async function runAISDKVerifier(input: VerificationInput) {
  const env = readAISDKEnv();
  const provider = createOpenAI({
    apiKey: env.apiKey,
    baseURL: env.baseURL,
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

    const result = await generateText({
      model: provider(env.model),
      system: buildSystemPrompt('ai-sdk'),
      prompt: buildVerifierPrompt(input),
      tools: buildTools(runtime),
      maxSteps: env.maxSteps,
    });

    const parsed = verificationOutputSchema.parse({
      ...JSON.parse(extractJsonObject(result.text)),
      package_name: input.package_name,
      package_version: input.package_version,
      verifier: 'ai-sdk',
    });

    const results: CandidateResult[] = parsed.results.map((entry) => ({
      ...entry,
      tool_trace: entry.tool_trace.length > 0 ? entry.tool_trace : runtime.snapshotTrace(),
    }));

    return {
      ...parsed,
      results,
    };
  } finally {
    await sandbox.stop();
  }
}
