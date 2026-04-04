import { generateText, generateObject, tool } from "ai";
import { z } from "zod";
import { config } from "../config.js";
import { getModel } from "../llm.js";
import { InvestigationOutput, type InvestigationAgentOutput, type ToolCallRecord } from "../models.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { readFileImpl, listFilesImpl, searchFilesImpl } from "./tools-read.js";
import { evalJsImpl, requireAndTraceImpl, runLifecycleHookImpl, fastForwardTimersImpl } from "./tools-execute.js";
import type { DockerSandboxController } from "../sandbox/controller.js";

export async function runInvestigationAgent(
  input: InvestigationInput,
  sandbox: DockerSandboxController,
  lifecycleHooks: Record<string, string>,
): Promise<InvestigationAgentOutput> {
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

  // Collect tool call records for observability
  const toolCallRecords: ToolCallRecord[] = [];
  let stepIndex = 0;

  console.log(`[agent] starting investigation of ${input.packageName || "unknown"}`);

  // Step 1: Multi-turn investigation with tool use
  const result = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(input),
    tools,
    maxSteps: config.maxAgentTurns,
    onStepFinish({ toolCalls, toolResults, text }) {
      stepIndex++;
      console.log(`[agent] ── step ${stepIndex} ──`);

      // Log each tool call and its result
      for (const tc of toolCalls) {
        const argsStr = JSON.stringify(tc.args).slice(0, 200);
        console.log(`[agent]   → ${tc.toolName}(${argsStr})`);

        const tr = toolResults.find(
          (r: { toolCallId: string }) => r.toolCallId === tc.toolCallId,
        );
        const resultStr = tr ? String(tr.result) : "(no result)";
        const preview = resultStr.slice(0, 500);
        const injectionDetected = resultStr.includes("[REDACTED: potential prompt injection");

        console.log(`[agent]   ← ${resultStr.length}B${injectionDetected ? " [INJECTION_REDACTED]" : ""}`);
        // Show first few lines of the result for quick visibility
        const previewLines = preview.split("\n").slice(0, 6);
        for (const line of previewLines) {
          console.log(`[agent]     ${line}`);
        }
        if (resultStr.length > 500) {
          console.log(`[agent]     ... (${resultStr.length - 500} more bytes)`);
        }

        toolCallRecords.push({
          tool: tc.toolName,
          args: tc.args as Record<string, unknown>,
          resultPreview: preview,
          timestamp: new Date().toISOString(),
          injectionDetected,
        });
      }

      // Log agent reasoning between tool calls
      if (text) {
        console.log(`[agent]   reasoning: ${text.slice(0, 500)}`);
        if (text.length > 500) {
          console.log(`[agent]   ... (${text.length - 500} more chars)`);
        }
      }
    },
  });

  console.log(`[agent] investigation complete — ${result.steps.length} steps, ${toolCallRecords.length} tool calls`);

  // Log the agent's final text response
  if (result.text) {
    console.log(`[agent] final response (${result.text.length} chars):`);
    const lines = result.text.slice(0, 1000).split("\n").slice(0, 15);
    for (const line of lines) {
      console.log(`[agent]   ${line}`);
    }
    if (result.text.length > 1000) {
      console.log(`[agent]   ... (${result.text.length - 1000} more chars)`);
    }
  }

  // Build concise tool context for the extraction LLM
  const toolCallLog: string[] = [];
  for (const tc of toolCallRecords) {
    toolCallLog.push(`[${tc.tool}](${JSON.stringify(tc.args).slice(0, 200)}) → ${tc.resultPreview.slice(0, 300)}`);
  }
  const toolContext = toolCallLog.length > 0
    ? `\n\nTool call log (${toolCallLog.length} calls):\n${toolCallLog.join("\n")}`
    : "";

  // Step 2: Extract structured findings from the conversation
  console.log("[agent] extracting structured findings...");
  const extractionPrompt =
    "Based on the investigation below, extract all findings as structured data.\n\n" +
    `Investigation result:\n${result.text}${toolContext}`;
  console.log(`[agent] extraction prompt: ${extractionPrompt.length} chars (${toolCallLog.length} tool calls included)`);

  const extraction = await generateObject({
    model,
    schema: InvestigationOutput,
    prompt: extractionPrompt,
  });

  console.log(`[agent] extraction complete — ${extraction.object.findings.length} findings`);
  for (const f of extraction.object.findings) {
    console.log(`[agent]   [${f.confidence}] ${f.capability} @ ${f.fileLine}: ${f.problem.slice(0, 120)}`);
  }

  return {
    ...extraction.object,
    toolCalls: toolCallRecords,
    agentText: result.text,
  };
}

// Re-export for type inference
import type { InvestigationInput } from "../models.js";
