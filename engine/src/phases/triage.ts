import * as fs from "node:fs";
import * as path from "node:path";
import { generateObject } from "ai";
import { config, SOURCE_FILE_TYPES } from "../config.js";
import { getModel } from "../llm.js";
import { FileVerdict, TriageResult, type InventoryReport } from "../models.js";
import { z } from "zod";

const MAX_FILE_SIZE = 500_000; // 500KB — files larger than this skip LLM

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const MAP_SYSTEM = `You are a security analyst examining a single file from an npm package.
Your job: report what this code DOES, not whether it's malicious.
Line numbers are provided — reference them in your output.

Report:
- capabilities: Node.js APIs and capabilities used. Use these labels where applicable: NETWORK, FILESYSTEM, ENV_VARS, PROCESS_SPAWN, EVAL, CRYPTO, DNS, DOM_MANIPULATION, BINARY_DOWNLOAD, OBFUSCATION, LIFECYCLE_HOOK, CLIPBOARD, TELEMETRY. Add other labels as needed.
- suspiciousPatterns: anything unusual — obfuscation, encoded strings, dynamic require, eval chains, string concatenation building URLs or shell commands, anti-debugging, hidden code after whitespace, minified code with suspicious logic. Include line numbers (e.g. "L42-67: obfuscated string building a URL").
- suspiciousLines: line range(s) containing the most suspicious code, e.g. "12-45" or "12-30,55-80". Null if nothing suspicious.
- summary: one sentence describing what the file does.
- riskContribution: 0 (boring utility code) to 10 (clearly dangerous behavior). Most legitimate code scores 0-2.`;

function numberLines(contents: string): string {
  return contents
    .split("\n")
    .map((line, i) => `${i + 1}: ${line}`)
    .join("\n");
}

function buildMapPrompt(
  fileName: string,
  contents: string,
  fileFlags: string[],
): string {
  let prompt = `## File: ${fileName}\n\n\`\`\`\n${numberLines(contents)}\n\`\`\``;
  if (fileFlags.length > 0) {
    prompt += `\n\n## Structural flags for this file\n${fileFlags.join("\n")}`;
  }
  return prompt;
}

const REDUCE_SYSTEM = `You are a security triage expert producing a final risk assessment for an npm package.

You receive:
- Package metadata (what it CLAIMS to be)
- Per-file analysis results (what it ACTUALLY does)
- Structural flags from automated scanning

Your job:
1. CAPABILITY MISMATCH: Flag capabilities that don't match the package's stated purpose. A color-formatting library shouldn't need NETWORK. A parser shouldn't touch ENV_VARS. A utility library shouldn't spawn processes.
2. RISK SCORE: 0 = clearly benign, 10 = clearly malicious. Scores 3+ trigger expensive deep investigation. Most legitimate packages score 0-2. Be paranoid — false positives are acceptable, false negatives are not.
3. FOCUS AREAS: Which specific files should deep investigation examine first and why. ALWAYS include the line range (e.g. "12-45") from the per-file analysis — investigation needs exact lines to examine.

If any file was flagged as too large for analysis, treat that as suspicious and factor it into the score.`;

function buildReducePrompt(
  inventory: InventoryReport,
  fileVerdicts: FileVerdict[],
): string {
  const meta = inventory.metadata;
  const sections: string[] = [];

  sections.push(`## Package metadata
- name: ${meta.name ?? "unknown"}
- version: ${meta.version ?? "unknown"}
- description: ${meta.description ?? "(none)"}
- license: ${meta.license ?? "unknown"}
- homepage: ${meta.homepage ?? "(none)"}`);

  if (Object.keys(inventory.scripts).length > 0) {
    sections.push(
      `## Lifecycle scripts\n${Object.entries(inventory.scripts)
        .map(([k, v]) => `- ${k}: \`${v}\``)
        .join("\n")}`,
    );
  }

  const allCaps = new Set(fileVerdicts.flatMap((v) => v.capabilities));
  sections.push(`## Aggregated capabilities across all files\n${[...allCaps].join(", ") || "(none)"}`);

  sections.push(
    `## Per-file analysis results\n${fileVerdicts
      .map(
        (v) =>
          `### ${v.file} (risk: ${v.riskContribution}/10)\n` +
          `Summary: ${v.summary}\n` +
          `Capabilities: ${v.capabilities.join(", ") || "none"}\n` +
          `Suspicious lines: ${v.suspiciousLines ?? "none"}\n` +
          `Suspicious patterns: ${v.suspiciousPatterns.join("; ") || "none"}`,
      )
      .join("\n\n")}`,
  );

  if (inventory.flags.length > 0) {
    sections.push(
      `## Structural flags from automated scanning\n${inventory.flags
        .map((f) => `- [${f.severity}] ${f.check}: ${f.detail}`)
        .join("\n")}`,
    );
  }

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// MAP: per-file analysis
// ---------------------------------------------------------------------------

async function analyzeFile(
  packagePath: string,
  filePath: string,
  fileFlags: string[],
): Promise<FileVerdict> {
  const absPath = path.join(packagePath, filePath);
  let contents: string;
  try {
    contents = fs.readFileSync(absPath, "utf-8");
  } catch {
    return {
      file: filePath,
      capabilities: [],
      suspiciousPatterns: ["file-unreadable"],
      suspiciousLines: null,
      summary: "Could not read file",
      riskContribution: 3,
    };
  }

  // Too-large files: synthetic verdict, no LLM call
  if (contents.length > MAX_FILE_SIZE) {
    return {
      file: filePath,
      capabilities: [],
      suspiciousPatterns: ["file-too-large-for-context"],
      suspiciousLines: null,
      summary: `File is ${Math.round(contents.length / 1024)}KB — too large for triage analysis`,
      riskContribution: 7,
    };
  }

  // Empty/trivial files: skip LLM
  if (contents.trim().length === 0) {
    return {
      file: filePath,
      capabilities: [],
      suspiciousPatterns: [],
      suspiciousLines: null,
      summary: "Empty file",
      riskContribution: 0,
    };
  }

  const model = getModel(config.triageModel);
  const result = await generateObject({
    model,
    schema: FileVerdict,
    system: MAP_SYSTEM,
    prompt: buildMapPrompt(filePath, contents, fileFlags),
  });

  const verdict = { ...result.object, file: filePath };
  console.log(`[triage:map] ${filePath} → risk=${verdict.riskContribution}/10 caps=[${verdict.capabilities.join(", ")}] suspicious=[${verdict.suspiciousPatterns.join("; ")}]`);
  return verdict;
}

// ---------------------------------------------------------------------------
// REDUCE: synthesis + capability mismatch
// ---------------------------------------------------------------------------

async function synthesizeTriageResult(
  inventory: InventoryReport,
  fileVerdicts: FileVerdict[],
): Promise<TriageResult> {
  const model = getModel(config.triageModel);
  const result = await generateObject({
    model,
    schema: TriageResult,
    system: REDUCE_SYSTEM,
    prompt: buildReducePrompt(inventory, fileVerdicts),
  });
  return result.object;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface TriagePhaseOutput {
  result: TriageResult;
  fileVerdicts: FileVerdict[];
}

export async function runTriage(
  packagePath: string,
  inventory: InventoryReport,
): Promise<TriagePhaseOutput> {
  const sourceFiles = inventory.files.filter(
    (f) => SOURCE_FILE_TYPES.has(f.fileType) && !f.isBinary,
  );

  console.log(
    `[triage] MAP phase: ${sourceFiles.length} source files for ${inventory.metadata.name ?? "unknown"}`,
  );

  // Build per-file flag lookup
  const flagsByFile = new Map<string, string[]>();
  for (const flag of inventory.flags) {
    if (flag.file) {
      const existing = flagsByFile.get(flag.file) ?? [];
      existing.push(`[${flag.severity}] ${flag.check}: ${flag.detail}`);
      flagsByFile.set(flag.file, existing);
    }
  }

  // MAP: analyze each file in parallel
  const fileVerdicts = await Promise.all(
    sourceFiles.map((f) =>
      analyzeFile(packagePath, f.path, flagsByFile.get(f.path) ?? []),
    ),
  );

  console.log(
    `[triage] REDUCE phase: synthesizing ${fileVerdicts.length} file verdicts`,
  );

  // REDUCE: synthesize into final triage result
  const triageResult = await synthesizeTriageResult(inventory, fileVerdicts);

  console.log(
    `[triage] result: riskScore=${triageResult.riskScore}, focusAreas=${triageResult.focusAreas.length}`,
  );

  return { result: triageResult, fileVerdicts };
}
