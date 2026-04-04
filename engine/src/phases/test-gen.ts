import type { Proof } from "../models.js";
import type { InvestigationResult } from "./investigate.js";

/** Phase 1c: Auto-generate tests from findings. STUB — returns proofs unchanged. */
export async function generateTests(
  investigation: InvestigationResult,
  _packagePath: string,
): Promise<Proof[]> {
  console.log(`[STUB] test-gen: ${investigation.proofs.length} proofs, no tests generated`);
  return investigation.proofs;
}
