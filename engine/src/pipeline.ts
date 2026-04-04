import { config } from "./config.js";
import { Proof, type AuditReport } from "./models.js";
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

export async function runAudit(packageName: string): Promise<AuditReport> {
  console.log(`[pipeline] starting audit for ${packageName}`);

  // Phase 0a: Resolve package
  const resolved = await withTimeout(
    resolvePackage(packageName),
    2 * 60_000,
    "resolve",
  );

  try {
    // Phase 0b: Inventory
    const inventory = await withTimeout(
      analyzeInventory(resolved.path),
      30_000,
      "inventory",
    );

    console.log(
      `[pipeline] inventory: ${inventory.files.length} files, ${inventory.flags.length} flags, dealbreaker=${!!inventory.dealbreaker}`,
    );

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
      };
    }

    // Phase 1a: Triage (STUB)
    const triage = await withTimeout(
      runTriage(resolved.path, inventory),
      30_000,
      "triage",
    );

    if (triage.riskScore < config.triageRiskThreshold) {
      console.log(`[pipeline] low risk (${triage.riskScore}) — returning SAFE`);
      return {
        verdict: "SAFE",
        capabilities: [],
        proofs: [],
        triage,
        findings: [],
      };
    }

    // Phase 1b: Investigation (REAL)
    const investigationResult = await withTimeout(
      investigate(resolved.path, inventory, triage),
      5 * 60_000,
      "investigation",
    );

    // Phase 1c: Test generation (STUB)
    const proofs = await withTimeout(
      generateTests(investigationResult, resolved.path),
      2 * 60_000,
      "test-gen",
    );

    // Phase 2: Proof verification (STUB)
    const verifiedProofs = await withTimeout(
      verifyProofs(proofs, resolved.path),
      5 * 60_000,
      "verify",
    );

    const verdict = verifiedProofs.length > 0 ? "DANGEROUS" : "SAFE";
    console.log(`[pipeline] verdict: ${verdict} (${verifiedProofs.length} proofs)`);

    return {
      verdict,
      capabilities: investigationResult.capabilities,
      proofs: verifiedProofs,
      triage,
      findings: investigationResult.findings,
    };
  } finally {
    cleanupPackage(resolved);
  }
}
