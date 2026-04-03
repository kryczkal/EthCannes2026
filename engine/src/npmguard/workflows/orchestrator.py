from datetime import timedelta

from temporalio import workflow

# Non-deterministic imports like time, network etc are banned in workflows
# So we import our own modules safely here via temporal proxy wrappers if needed

with workflow.unsafe.imports_passed_through():
    from npmguard.models import AuditReport, CapabilityEnum, Proof, VerdictEnum

# Import the activity signatures
from npmguard.activities.fuzzing import fuzz_adversarial
from npmguard.activities.sandbox import analyze_sandbox
from npmguard.activities.static_analysis import analyze_static


@workflow.defn
class NpmGuardOrchestrator:
    @workflow.run
    async def run(self, package_name: str) -> AuditReport:
        capabilities: set[CapabilityEnum] = set()
        proofs: list[Proof] = []

        # Layer 1 & 2: Run in parallel since they don't depend on each other initially
        static_future = workflow.execute_activity(
            analyze_static,
            package_name,
            schedule_to_close_timeout=timedelta(minutes=5),
        )

        sandbox_future = workflow.execute_activity(
            analyze_sandbox,
            package_name,
            schedule_to_close_timeout=timedelta(minutes=10),
        )

        static_caps, static_proofs = await static_future
        sandbox_caps, sandbox_proofs = await sandbox_future

        capabilities.update(static_caps)
        capabilities.update(sandbox_caps)
        proofs.extend(static_proofs)
        proofs.extend(sandbox_proofs)

        fuzzing_proofs = await workflow.execute_activity(
            fuzz_adversarial,
            package_name,
            schedule_to_close_timeout=timedelta(minutes=15),
        )
        proofs.extend(fuzzing_proofs)

        verdict = VerdictEnum.SAFE
        if len(proofs) > 0:
            verdict = VerdictEnum.DANGEROUS

        return AuditReport(verdict=verdict, capabilities=list(capabilities), proofs=proofs)
