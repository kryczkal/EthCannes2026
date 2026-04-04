from datetime import timedelta

from temporalio import workflow

# Temporal's workflow sandbox restricts imports to enforce determinism.
# Activity modules pull in pydantic-ai / beartype which break under the sandbox,
# so we pass all our imports through unsandboxed.
with workflow.unsafe.imports_passed_through():
    from npmguard.activities.fuzzing import fuzz_adversarial
    from npmguard.activities.resolve_package import cleanup_package, resolve_package
    from npmguard.activities.sandbox import analyze_sandbox
    from npmguard.activities.static_analysis import analyze_static
    from npmguard.activities.verify_proofs import verify_proofs
    from npmguard.inventory import InventoryReport, analyze_inventory
    from npmguard.investigation.activity import investigate_package
    from npmguard.investigation.models import InvestigationInput
    from npmguard.models import AuditReport, CapabilityEnum, Proof, ResolvedPackage, VerdictEnum


@workflow.defn
class NpmGuardOrchestrator:
    @workflow.run
    async def run(self, package_name: str) -> AuditReport:
        capabilities: set[CapabilityEnum] = set()
        proofs: list[Proof] = []

        # Step 0: Resolve package name → extracted directory path
        resolved: ResolvedPackage = await workflow.execute_activity(
            resolve_package,
            package_name,
            schedule_to_close_timeout=timedelta(minutes=2),
        )

        try:
            # Phase 0: Inventory — structural triage
            inventory: InventoryReport = await workflow.execute_activity(
                analyze_inventory,
                resolved.path,
                schedule_to_close_timeout=timedelta(seconds=30),
            )
            if inventory.dealbreaker:
                return AuditReport(
                    verdict=VerdictEnum.DANGEROUS,
                    capabilities=[],
                    proofs=[
                        Proof(
                            file_line="package.json",
                            problem=f"Dealbreaker: {inventory.dealbreaker.check}",
                            evidence=inventory.dealbreaker.detail,
                        )
                    ],
                )

            # Layer 1 & 2: Run in parallel
            # Static analysis gets the resolved path; sandbox resolves names internally
            static_future = workflow.execute_activity(
                analyze_static,
                resolved.path,
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

            # Phase 1b: Agentic investigation (only if signals found)
            if proofs or inventory.flags:
                inv_input = InvestigationInput(
                    package_path=resolved.path,
                    package_name=inventory.name if hasattr(inventory, "name") else "",
                    version=inventory.version if hasattr(inventory, "version") else "",
                    flags=[f.check for f in inventory.flags] if inventory.flags else [],
                    static_caps=[c.value for c in capabilities],
                    static_proof_summaries=[p.problem for p in proofs[:10]],
                )
                inv_caps, inv_proofs = await workflow.execute_activity(
                    investigate_package,
                    inv_input,
                    schedule_to_close_timeout=timedelta(minutes=10),
                )
                capabilities.update(inv_caps)
                proofs.extend(inv_proofs)

            # Layer 3: Adversarial fuzzing (sequential)
            fuzzing_proofs = await workflow.execute_activity(
                fuzz_adversarial,
                package_name,
                schedule_to_close_timeout=timedelta(minutes=15),
            )
            proofs.extend(fuzzing_proofs)

            # Phase 4: Proof verification — re-verify each proof
            if proofs:
                proofs = await workflow.execute_activity(
                    verify_proofs,
                    (proofs, resolved.path),
                    schedule_to_close_timeout=timedelta(minutes=2),
                )
        finally:
            # Cleanup temp directory if we fetched a real npm package
            if resolved.needs_cleanup and resolved.tmpdir:
                await workflow.execute_activity(
                    cleanup_package,
                    resolved.tmpdir,
                    schedule_to_close_timeout=timedelta(seconds=30),
                )

        verdict = VerdictEnum.DANGEROUS if proofs else VerdictEnum.SAFE

        return AuditReport(verdict=verdict, capabilities=list(capabilities), proofs=proofs)
