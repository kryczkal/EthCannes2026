import { config, SOURCE_FILE_TYPES } from "./config.js";
import { Proof, type AuditReport, type PhaseLog } from "./models.js";
import { resolvePackage, cleanupPackage } from "./phases/resolve.js";
import { analyzeInventory } from "./phases/inventory.js";
import { runTriage } from "./phases/triage.js";
import { investigate } from "./phases/investigate.js";
import { generateTests } from "./phases/test-gen.js";
import { verifyProofs } from "./phases/verify.js";
import { startAuditLog, writeLog, getRunDir } from "./audit-log.js";
import type { EmitFn } from "./events.js";
import { setSessionPackagePath } from "./events.js";

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
  emit?: EmitFn,
): Promise<{ result: T; log: PhaseLog }> {
  emit?.("phase_started", { phase: name });
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
  emit?.("phase_completed", { phase: name, durationMs });
  return { result, log };
}

export interface AuditResult {
  report: AuditReport;
  packagePath: string;
  cleanup: () => void;
}

export async function runAudit(packageName: string, emit?: EmitFn, auditId?: string): Promise<AuditResult> {
  console.log(`[pipeline] starting audit for ${packageName}`);
  startAuditLog(packageName);
  const trace: PhaseLog[] = [];

  emit?.("audit_started", { packageName });

  // Phase 0a: Resolve package
  const { result: resolved, log: resolveLog } = await timedPhase(
    "resolve",
    () => resolvePackage(packageName),
    2 * 60_000,
    { packageName },
    (r) => ({ path: r.path, needsCleanup: r.needsCleanup }),
    emit,
  );
  trace.push(resolveLog);
  writeLog("resolve.json", resolved);

  // Store package path on session so file-serving endpoint works
  if (auditId) setSessionPackagePath(auditId, resolved.path);

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
      emit,
    );
    trace.push(inventoryLog);
    writeLog("inventory.json", inventory);

    // Emit file list for frontend visualization
    emit?.("file_list", { files: inventory.files });

    // Scale phase timeouts by file count: base timeout for ≤20 files,
    // +50% per 20 extra files, clamped at 4× base.
    const sourceFileCount = inventory.files.filter(
      (f) => SOURCE_FILE_TYPES.has(f.fileType) && !f.isBinary,
    ).length;
    const timeoutScale = Math.min(
      4,
      1 + Math.max(0, sourceFileCount - 20) * 0.025,
    );
    console.log(
      `[pipeline] ${sourceFileCount} source files → timeout scale ${timeoutScale.toFixed(2)}×`,
    );

    // Dealbreaker -> immediate DANGEROUS
    if (inventory.dealbreaker) {
      const report: AuditReport = {
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
      emit?.("verdict_reached", { verdict: report.verdict, capabilities: [], proofCount: report.proofs.length });
      return { report, packagePath: resolved.path, cleanup: () => cleanupPackage(resolved) };
    }

    // Phase 1a: Triage
    const { result: triageOutput, log: triageLog } = await timedPhase(
      "triage",
      () => runTriage(resolved.path, inventory, emit),
      2 * 60_000 * timeoutScale,
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
      emit,
    );
    trace.push(triageLog);
    writeLog("triage.json", triageOutput);
    const triage = triageOutput.result;

    // Emit triage complete for frontend
    emit?.("triage_complete", {
      riskScore: triage.riskScore,
      riskSummary: triage.riskSummary,
      focusAreas: triage.focusAreas,
    });

    if (triage.riskScore < config.triageRiskThreshold) {
      console.log(`[pipeline] low risk (${triage.riskScore}) — returning SAFE`);
      const report: AuditReport = {
        verdict: "SAFE",
        capabilities: [],
        proofs: [],
        triage,
        findings: [],
        trace,
      };
      emit?.("verdict_reached", { verdict: "SAFE", capabilities: [], proofCount: 0 });
      return { report, packagePath: resolved.path, cleanup: () => cleanupPackage(resolved) };
    }

    // Phase 1b: Investigation
    const { result: investigationResult, log: investigateLog } = await timedPhase(
      "investigation",
      () => investigate(resolved.path, inventory, triage, triageOutput.fileVerdicts, emit),
      5 * 60_000 * timeoutScale,
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
      emit,
    );
    trace.push(investigateLog);
    writeLog("investigation.json", investigationResult);

    // Phase 1c: Test generation
    const { result: proofs, log: testGenLog } = await timedPhase(
      "test-gen",
      () => generateTests(investigationResult, resolved.path),
      5 * 60_000 * timeoutScale,
      { proofCount: investigationResult.proofs.length, findingCount: investigationResult.findings.length },
      (p) => ({
        proofCount: p.length,
        withTests: p.filter((x) => x.testFile).length,
      }),
      emit,
    );
    trace.push(testGenLog);

    // Phase 2: Proof verification
    const { result: verifiedProofs, log: verifyLog } = await timedPhase(
      "verify",
      () => verifyProofs(proofs, resolved.path),
      5 * 60_000 * timeoutScale,
      { proofCount: proofs.length, withTests: proofs.filter((x) => x.testFile).length },
      (p) => ({
        verifiedCount: p.length,
        confirmed: p.filter((x) => x.kind === "TEST_CONFIRMED").length,
        unconfirmed: p.filter((x) => x.kind === "TEST_UNCONFIRMED").length,
      }),
      emit,
    );
    trace.push(verifyLog);

    const verdict = verifiedProofs.length > 0 ? "DANGEROUS" : "SAFE";
    console.log(`[pipeline] verdict: ${verdict} (${verifiedProofs.length} proofs)`);

    const report: AuditReport = {
      verdict,
      capabilities: investigationResult.capabilities,
      proofs: verifiedProofs,
      triage,
      findings: investigationResult.findings,
      trace,
    };
    writeLog("report.json", report);
    console.log(`[pipeline] full logs saved to ${getRunDir()}`);

    emit?.("verdict_reached", {
      verdict: report.verdict,
      capabilities: report.capabilities,
      proofCount: report.proofs.length,
    });

    return { report, packagePath: resolved.path, cleanup: () => cleanupPackage(resolved) };
  } catch (err) {
    cleanupPackage(resolved);
    throw err;
  }
}
