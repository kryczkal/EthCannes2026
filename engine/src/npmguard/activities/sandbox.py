from temporalio import activity

from npmguard.models import CapabilityEnum, Proof


@activity.defn
async def analyze_sandbox(package_path: str) -> tuple[list[CapabilityEnum], list[Proof]]:
    """
    Layer 2: Sandbox Execution
    Executes 'npm install' in a docker container and hooks OS-level events.
    """
    capabilities: list[CapabilityEnum] = []
    proofs: list[Proof] = []
    # TODO: Implement strace hooking, network monitoring, metadata probing
    return capabilities, proofs
