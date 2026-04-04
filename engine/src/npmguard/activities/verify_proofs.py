"""
Phase 4: Proof Verification

Re-verifies each proof to confirm it is reproducible. Static proofs are verified
by re-hashing the source file and comparing against the recorded content_hash.
Dynamic proofs are marked reproducible if they have a reproduction command.
"""

from __future__ import annotations

import hashlib
import os

import structlog
from temporalio import activity

from npmguard.models import Proof, ProofKind

log = structlog.get_logger()


@activity.defn
async def verify_proofs(proofs_and_path: tuple[list[Proof], str]) -> list[Proof]:
    """Re-verify each proof and mark reproducible=True if confirmed."""
    proofs, package_path = proofs_and_path
    verified: list[Proof] = []

    for proof in proofs:
        if proof.kind in (
            ProofKind.STRUCTURAL,
            ProofKind.AI_STATIC,
        ):
            if proof.content_hash and _verify_hash(package_path, proof.file_line, proof.content_hash):
                proof = proof.model_copy(update={"reproducible": True})
        elif proof.kind in (ProofKind.AI_DYNAMIC, ProofKind.TEST_CONFIRMED):
            # Dynamic sandbox proofs are reproducible if they have a reproduction command
            if proof.reproduction_cmd:
                proof = proof.model_copy(update={"reproducible": True})
        verified.append(proof)

    reproducible_count = sum(1 for p in verified if p.reproducible)
    log.info(
        "proof_verification_complete",
        total=len(verified),
        reproducible=reproducible_count,
    )
    return verified


def _verify_hash(package_path: str, file_line: str, expected_hash: str) -> bool:
    """Re-hash the file referenced by *file_line* and compare to *expected_hash*."""
    # file_line format: "rel_path:line_num" or "package.json:scripts.preinstall"
    rel_path = file_line.split(":")[0]
    abs_path = os.path.join(package_path, rel_path)

    try:
        with open(abs_path, encoding="utf-8") as f:
            content = f.read()
        actual_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        return actual_hash == expected_hash
    except (OSError, UnicodeDecodeError):
        log.debug("verify_hash_file_unreadable", path=abs_path)
        return False
