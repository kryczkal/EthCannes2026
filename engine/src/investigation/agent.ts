import { generateText, generateObject, tool } from "ai";
import { z } from "zod";
import { config } from "../config.js";
import { getModel } from "../llm.js";
import { InvestigationOutput, type InvestigationInput } from "../models.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { readFileImpl, listFilesImpl, searchFilesImpl } from "./tools-read.js";
import { evalJsImpl, requireAndTraceImpl, runLifecycleHookImpl, fastForwardTimersImpl } from "./tools-execute.js";
import type { DockerSandboxController } from "../sandbox/controller.js";

export async function runInvestigationAgent(
  input: InvestigationInput,
  sandbox: DockerSandboxController,
  lifecycleHooks: Record<string, string>,
): Promise<InvestigationOutput> {
  const model = getModel(config.investigationModel);
  const packagePath = input.packagePath;

  const tools = {
    readFile: tool({
      description: "Read a file from the package. Path is relative to package root.",
      parameters: z.object({ path: z.string() }),
      execute: async ({ path }) => readFileImpl(packagePath, path),
    }),
    listFiles: tool({
      description: "List all files in the package with sizes and extensions.",
      parameters: z.object({}),
      execute: async () => listFilesImpl(packagePath),
    }),
    searchFiles: tool({
      description: "Regex search across all text files in the package. Returns matches with surrounding context.",
      parameters: z.object({ pattern: z.string() }),
      execute: async ({ pattern }) => searchFilesImpl(packagePath, pattern),
    }),
    evalJs: tool({
      description:
        'Execute a JavaScript snippet in the sandbox for deobfuscation. ' +
        "e.g., evalJs({ code: \"console.log(atob('Y2hpbGRf...'))\" }) to decode base64. " +
        "Returns stdout + stderr. Hard timeout applies.",
      parameters: z.object({ code: z.string() }),
      execute: async ({ code }) => evalJsImpl(sandbox, code),
    }),
    requireAndTrace: tool({
      description:
        "Load a package entry point with full Node.js instrumentation. " +
        "Monkey-patches require, fs, http, child_process, process.env, crypto, eval, timers. " +
        "Returns a structured trace log. Entrypoint relative to package root (e.g. 'index.js').",
      parameters: z.object({ entrypoint: z.string() }),
      execute: async ({ entrypoint }) => requireAndTraceImpl(sandbox, entrypoint),
    }),
    runLifecycleHook: tool({
      description:
        "Run a lifecycle script (preinstall, postinstall, install, prepare) with instrumentation. " +
        "Only allowed hook names are accepted.",
      parameters: z.object({ hookName: z.string() }),
      execute: async ({ hookName }) => runLifecycleHookImpl(sandbox, hookName, lifecycleHooks),
    }),
    fastForwardTimers: tool({
      description:
        "Load the package with fake timers, then advance time by advanceMs milliseconds. " +
        "Use to trigger time-gated payloads (e.g., setTimeout with 48h delay). " +
        "Entrypoint relative to package root.",
      parameters: z.object({
        entrypoint: z.string(),
        advanceMs: z.number(),
      }),
      execute: async ({ entrypoint, advanceMs }) =>
        fastForwardTimersImpl(sandbox, entrypoint, advanceMs),
    }),
  };

  console.log(`[agent] starting investigation of ${input.packageName || "unknown"}`);

  // Step 1: Multi-turn investigation with tool use
  const result = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(input),
    tools,
    maxSteps: config.maxAgentTurns,
  });

  console.log(`[agent] investigation complete — ${result.steps.length} steps, extracting findings`);

  // Step 2: Extract structured findings from the conversation
  const extraction = await generateObject({
    model,
    schema: InvestigationOutput,
    prompt:
      "Based on the investigation above, extract all findings as structured data.\n\n" +
      `Investigation result:\n${result.text}`,
  });

  return extraction.object;
}
