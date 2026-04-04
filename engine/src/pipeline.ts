import { config, SOURCE_FILE_TYPES } from "./config.js";
import { Proof, type AuditReport, type PhaseLog } from "./models.js";
import { resolvePackage, cleanupPackage } from "./phases/resolve.js";
import { analyzeInventory } from "./phases/inventory.js";
import { runTriage } from "./phases/triage.js";
import { investigate } from "./phases/investigate.js";
import { generateTests } from "./phases/test-gen.js";
import { verifyProofs } from "./phases/verify.js";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function timedPhase<T>(
  name: string,
  fn: () => Promise<T>,
  timeoutMs: number,
  inputSummary: Record<string, unknown>,
  outputSummary: (result: T) => Record<string, unknown>,
): Promise<{ result: T; log: PhaseLog }> {
  const start = Date.now();
  const result = await withTimeout(fn(), timeoutMs, name);
  const durationMs = Date.now() - start;
  const log: PhaseLog = {
    phase: name,
    durationMs,
    input: inputSummary,
    output: outputSummary(result),
  };
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[${name}] completed in ${durationMs}ms`);
  console.log(`${"─".repeat(60)}`);
  console.log(`[${name}] INPUT:`);
  console.log(JSON.stringify(log.input, null, 2));
  console.log(`[${name}] OUTPUT:`);
  console.log(JSON.stringify(log.output, null, 2));
  console.log(`${"=".repeat(60)}\n`);
  return { result, log };
}

export async function runAudit(packageName: string): Promise<AuditReport> {
  console.log(`[pipeline] starting audit for ${packageName}`);
  const trace: PhaseLog[] = [];

  // Phase 0a: Resolve package
  const { result: resolved, log: resolveLog } = await timedPhase(
    "resolve",
    () => resolvePackage(packageName),
    2 * 60_000,
    { packageName },
    (r) => ({ path: r.path, needsCleanup: r.needsCleanup }),
  );
  trace.push(resolveLog);

  try {
    // Phase 0b: Inventory
    const { result: inventory, log: inventoryLog } = await timedPhase(
      "inventory",
      () => analyzeInventory(resolved.path),
      30_000,
      { packagePath: resolved.path },
      (inv) => ({
        fileCount: inv.files.length,
        sourceFiles: inv.files.filter((f) => SOURCE_FILE_TYPES.has(f.fileType)).length,
        flagCount: inv.flags.length,
        flags: inv.flags.map((f) => `[${f.severity}] ${f.check}: ${f.detail}`),
        hasDealbreaker: !!inv.dealbreaker,
        scripts: inv.scripts,
        metadata: inv.metadata,
        entryPoints: inv.entryPoints,
      }),
    );
    trace.push(inventoryLog);

    // Dealbreaker → immediate DANGEROUS
    if (inventory.dealbreaker) {
      return {
        verdict: "DANGEROUS",
        capabilities: [],
        proofs: [Proof.parse({
          confidence: "CONFIRMED",
          fileLine: "",
          problem: inventory.dealbreaker.detail,
          evidence: `Dealbreaker: ${inventory.dealbreaker.check}`,
          kind: "STRUCTURAL",
          reproducible: true,
        })],
        triage: null,
        findings: [],
        trace,
      };
    }

    // Phase 1a: Triage
    const { result: triageOutput, log: triageLog } = await timedPhase(
      "triage",
      () => runTriage(resolved.path, inventory),
      2 * 60_000,
      {
        sourceFiles: inventory.files
          .filter((f) => SOURCE_FILE_TYPES.has(f.fileType) && !f.isBinary)
          .map((f) => ({ path: f.path, sizeBytes: f.sizeBytes })),
        flagCount: inventory.flags.length,
        packageName: inventory.metadata.name,
      },
      (t) => ({
        riskScore: t.result.riskScore,
        riskSummary: t.result.riskSummary,
        focusAreas: t.result.focusAreas,
        fileVerdicts: t.fileVerdicts,
      }),
    );
    trace.push(triageLog);
    const triage = triageOutput.result;

    if (triage.riskScore < config.triageRiskThreshold) {
      console.log(`[pipeline] low risk (${triage.riskScore}) — returning SAFE`);
      return {
        verdict: "SAFE",
        capabilities: [],
        proofs: [],
        triage,
        findings: [],
        trace,
      };
    }

    // Phase 1b: Investigation
    const { result: investigationResult, log: investigateLog } = await timedPhase(
      "investigation",
      () => investigate(resolved.path, inventory, triage, triageOutput.fileVerdicts),
      5 * 60_000,
      {
        riskScore: triage.riskScore,
        focusAreas: triage.focusAreas,
        packagePath: resolved.path,
      },
      (inv) => ({
        capabilityCount: inv.capabilities.length,
        capabilities: inv.capabilities,
        findingCount: inv.findings.length,
        findings: inv.findings.map((f) => ({
          capability: f.capability,
          confidence: f.confidence,
          fileLine: f.fileLine,
          problem: f.problem,
        })),
        proofCount: inv.proofs.length,
        toolCalls: inv.toolCalls.map((tc) => ({
          tool: tc.tool,
          args: tc.args,
          resultPreview: tc.resultPreview,
          timestamp: tc.timestamp,
          injectionDetected: tc.injectionDetected,
        })),
        agentText: inv.agentText.slice(0, 2000),
      }),
    );
    trace.push(investigateLog);

    // Phase 1c: Test generation
    const { result: proofs, log: testGenLog } = await timedPhase(
      "test-gen",
      () => generateTests(investigationResult, resolved.path),
      2 * 60_000,
      { proofCount: investigationResult.proofs.length },
      (p) => ({ proofCount: p.length }),
    );
    trace.push(testGenLog);

    // Phase 2: Proof verification
    const { result: verifiedProofs, log: verifyLog } = await timedPhase(
      "verify",
      () => verifyProofs(proofs, resolved.path),
      5 * 60_000,
      { proofCount: proofs.length },
      (p) => ({ verifiedCount: p.length }),
    );
    trace.push(verifyLog);

    const verdict = verifiedProofs.length > 0 ? "DANGEROUS" : "SAFE";
    console.log(`[pipeline] verdict: ${verdict} (${verifiedProofs.length} proofs)`);

    return {
      verdict,
      capabilities: investigationResult.capabilities,
      proofs: verifiedProofs,
      triage,
      findings: investigationResult.findings,
      trace,
    };
  } finally {
    cleanupPackage(resolved);
  }
}
