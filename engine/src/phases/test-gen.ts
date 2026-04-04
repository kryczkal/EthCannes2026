import type { CapabilityEnum, Proof } from "../models.js";

/** Phase 1c: Auto-generate tests from findings. STUB — returns proofs unchanged. */
export async function generateTests(
  findings: { capabilities: CapabilityEnum[]; proofs: Proof[] },
  _packagePath: string,
): Promise<Proof[]> {
  console.log(`[STUB] test-gen: ${findings.proofs.length} proofs, no tests generated`);
  return findings.proofs;
}
