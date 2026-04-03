from temporalio import activity

from npmguard.models import CapabilityEnum, Proof


@activity.defn
async def analyze_static(package_path: str) -> tuple[list[CapabilityEnum], list[Proof]]:
    """
    Layer 1: Static Analysis Engine
    Runs without executing the codebase. Relies on Python AST parsers and heuristics.
    """
    capabilities: list[CapabilityEnum] = []
    proofs: list[Proof] = []
    # TODO: Implement Anti-AI Prompt Detection, AST structural scanning, etc.
    return capabilities, proofs
