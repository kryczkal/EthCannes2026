import type { Proof } from "../models.js";

/** Phase 2: Proof verification. STUB — returns proofs unchanged. */
export async function verifyProofs(
  proofs: Proof[],
  _packagePath: string,
): Promise<Proof[]> {
  console.log(`[STUB] verify: ${proofs.length} proofs, returning unverified`);
  return proofs;
}
