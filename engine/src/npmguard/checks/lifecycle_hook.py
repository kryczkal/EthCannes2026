"""Tier-1 check: flag lifecycle hooks in package.json.

Any preinstall/postinstall/install/prepare script is suspicious —
legitimate packages rarely need them.  Pure data check, no LLM.
"""

from __future__ import annotations

from npmguard.checks.base import BaseCheck, CheckResult, PackageContext
from npmguard.models import CapabilityEnum, Proof


class LifecycleHookCheck(BaseCheck):
    name = "lifecycle_hook"
    tier = 1

    async def run(self, ctx: PackageContext) -> CheckResult:
        if not ctx.lifecycle_hooks:
            return CheckResult()

        proofs = [
            Proof(
                file_line=f"package.json:scripts.{hook_name}",
                problem=f"Lifecycle hook '{hook_name}' executes on install",
                proof_data=command[:300],
            )
            for hook_name, command in ctx.lifecycle_hooks.items()
        ]

        return CheckResult(
            capabilities=[CapabilityEnum.LIFECYCLE_HOOK],
            proofs=proofs,
        )
