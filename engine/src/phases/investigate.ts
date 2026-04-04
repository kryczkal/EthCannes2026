import { config } from "../config.js";
import type { CapabilityEnum, InvestigationInput, InventoryReport, Proof, TriageResult } from "../models.js";
import { DockerSandboxController } from "../sandbox/controller.js";
import { runInvestigationAgent } from "../investigation/agent.js";
import { LIFECYCLE_SCRIPTS } from "../inventory/parse-manifest.js";

export async function investigate(
  packagePath: string,
  inventory: InventoryReport,
  triage: TriageResult,
): Promise<{ capabilities: CapabilityEnum[]; proofs: Proof[] }> {
  if (!config.investigationEnabled) {
    console.log("[investigate] skipped — investigation disabled");
    return { capabilities: [], proofs: [] };
  }

  // Build investigation input
  const lifecycleHooks: Record<string, string> = {};
  for (const [key, value] of Object.entries(inventory.scripts)) {
    if (LIFECYCLE_SCRIPTS.has(key)) lifecycleHooks[key] = value;
  }

  const input: InvestigationInput = {
    packagePath,
    packageName: inventory.metadata.name ?? "",
    version: inventory.metadata.version ?? "",
    description: inventory.metadata.description ?? "",
    flags: inventory.flags.map((f) => `[${f.severity}] ${f.check}: ${f.detail}`),
    staticCaps: [],
    staticProofSummaries: [],
  };

  // Start sandbox
  const sandbox = new DockerSandboxController(
    config.sandboxImage,
    `${config.sandboxMemoryMb}m`,
    config.sandboxCpus,
    config.sandboxNetwork,
  );

  try {
    await sandbox.start(packagePath);

    const output = await runInvestigationAgent(input, sandbox, lifecycleHooks);

    // Convert findings to proofs
    const capabilities = new Set<CapabilityEnum>();
    const proofs: Proof[] = [];

    for (const finding of output.findings) {
      const cap = finding.capability as CapabilityEnum;
      capabilities.add(cap);

      proofs.push({
        capability: cap,
        attackPathway: "",
        confidence: finding.confidence,
        fileLine: finding.fileLine,
        problem: finding.problem,
        evidence: finding.evidence.slice(0, 500),
        kind: finding.confidence === "CONFIRMED" ? "AI_DYNAMIC" : "AI_STATIC",
        contentHash: null,
        reproducible: finding.confidence === "CONFIRMED",
        reproductionCmd: null,
        testFile: null,
        testHash: null,
        reasoningHash: null,
        teeAttestationId: null,
      });
    }

    return { capabilities: [...capabilities], proofs };
  } finally {
    await sandbox.stop();
  }
}
