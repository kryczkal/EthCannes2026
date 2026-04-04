import { config } from "../config.js";
import { CapabilityEnum, type FileVerdict, type Finding, type InvestigationInput, type InventoryReport, type Proof, type ToolCallRecord, type TriageResult } from "../models.js";
import { DockerSandboxController } from "../sandbox/controller.js";
import { runInvestigationAgent } from "../investigation/agent.js";
import { LIFECYCLE_SCRIPTS } from "../inventory/parse-manifest.js";
import type { EmitFn } from "../events.js";

export interface InvestigationResult {
  capabilities: CapabilityEnum[];
  proofs: Proof[];
  findings: Finding[];
  toolCalls: ToolCallRecord[];
  agentText: string;
}

export async function investigate(
  packagePath: string,
  inventory: InventoryReport,
  triage: TriageResult,
  fileVerdicts: FileVerdict[],
  emit?: EmitFn,
): Promise<InvestigationResult> {
  if (!config.investigationEnabled) {
    console.log("[investigate] skipped — investigation disabled");
    return { capabilities: [], proofs: [], findings: [], toolCalls: [], agentText: "" };
  }

  // Build investigation input
  const lifecycleHooks: Record<string, string> = {};
  for (const [key, value] of Object.entries(inventory.scripts)) {
    if (LIFECYCLE_SCRIPTS.has(key)) lifecycleHooks[key] = value;
  }

  // Collect capabilities and summaries from triage file verdicts
  const allCaps = new Set<string>();
  for (const fv of fileVerdicts) {
    for (const cap of fv.capabilities) allCaps.add(cap);
  }

  const input: InvestigationInput = {
    packagePath,
    packageName: inventory.metadata.name ?? "",
    version: inventory.metadata.version ?? "",
    description: inventory.metadata.description ?? "",
    flags: inventory.flags.map((f) => `[${f.severity}] ${f.check}: ${f.detail}`),
    staticCaps: [...allCaps],
    staticProofSummaries: triage.focusAreas.map((fa) =>
      `${fa.file}${fa.lines ? `:${fa.lines}` : ""}: ${fa.reason}`
    ),
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

    const output = await runInvestigationAgent(input, sandbox, lifecycleHooks, emit);

    // Emit findings for frontend visualization
    for (const finding of output.findings) {
      emit?.("finding_discovered", { finding });
    }

    // Convert findings to proofs
    const capabilities = new Set<CapabilityEnum>();
    const proofs: Proof[] = [];

    for (const finding of output.findings) {
      const capParsed = CapabilityEnum.safeParse(finding.capability);
      const cap = capParsed.success ? capParsed.data : null;
      if (cap) capabilities.add(cap);

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

    return {
      capabilities: [...capabilities],
      proofs,
      findings: output.findings,
      toolCalls: output.toolCalls,
      agentText: output.agentText,
    };
  } finally {
    await sandbox.stop();
  }
}
