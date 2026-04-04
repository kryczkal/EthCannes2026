"""Tier-1 check: flag lifecycle hooks in package.json.

Any preinstall/postinstall/install/prepare script is suspicious —
legitimate packages rarely need them.  Pure data check, no LLM.
"""

from __future__ import annotations

from npmguard.checks.base import BaseCheck, CheckResult, PackageContext
from npmguard.models import AttackPathway, CapabilityEnum, Proof, ProofKind


class LifecycleHookCheck(BaseCheck):
    name = "lifecycle_hook"
    tier = 1

    async def run(self, ctx: PackageContext) -> CheckResult:
        if not ctx.lifecycle_hooks:
            return CheckResult()

        pkg_hash = ctx.file_hashes.get("package.json")
        proofs = [
            Proof(
                capability=CapabilityEnum.LIFECYCLE_HOOK,
                file_line=f"package.json:scripts.{hook_name}",
                problem=f"Lifecycle hook '{hook_name}' executes on install",
                evidence=command[:300],
                kind=ProofKind.STRUCTURAL,
                content_hash=pkg_hash,
                attack_pathway=AttackPathway.LIFECYCLE_BINARY_DROP,
            )
            for hook_name, command in ctx.lifecycle_hooks.items()
        ]

        return CheckResult(
            capabilities=[CapabilityEnum.LIFECYCLE_HOOK],
            proofs=proofs,
        )
