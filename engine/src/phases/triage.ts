import type { InventoryReport, TriageResult } from "../models.js";

/** Phase 1a: Cheap LLM risk score. STUB — returns medium risk to always continue pipeline. */
export async function runTriage(
  _packagePath: string,
  inventory: InventoryReport,
): Promise<TriageResult> {
  console.log(`[STUB] triage for ${inventory.metadata.name ?? "unknown"}`);
  return {
    riskScore: 5,
    riskSummary: "STUB: triage not implemented — defaulting to medium risk",
    focusAreas: [],
  };
}
