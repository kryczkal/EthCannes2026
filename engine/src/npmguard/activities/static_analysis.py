"""Layer 1 — Static Analysis activity.

Runs a pipeline of pluggable checks over an extracted npm package directory.
No code is executed; analysis is purely static (regex + optional LLM reasoning).
"""

from __future__ import annotations

import asyncio

import structlog
from temporalio import activity

from npmguard.checks import CHECKS
from npmguard.checks.base import CheckResult, build_context
from npmguard.models import CapabilityEnum, Proof  # noqa: TC001

logger = structlog.get_logger()


@activity.defn
async def analyze_static(package_path: str) -> tuple[list[CapabilityEnum], list[Proof]]:
    """Layer 1: Static Analysis Engine.

    Runs without executing the codebase.  Each registered check scans the
    package for a specific class of threat and returns structured findings.
    """
    ctx = await build_context(package_path)
    logger.info(
        "static_analysis.start",
        package=ctx.package_name,
        files=len(ctx.files),
        checks=len(CHECKS),
    )

    # Tier 0 — gate checks (sequential, can short-circuit)
    for check in [c for c in CHECKS if c.tier == 0]:
        result = await check.run(ctx)
        if result.short_circuit:
            logger.warning(
                "static_analysis.short_circuit",
                check=check.name,
                proofs=len(result.proofs),
            )
            return result.capabilities, result.proofs

    # Tier 1 — all other checks (parallel)
    tier1 = [c for c in CHECKS if c.tier == 1]
    results: list[CheckResult] = list(await asyncio.gather(*[c.run(ctx) for c in tier1]))

    # Aggregate
    all_caps = list({cap for r in results for cap in r.capabilities})
    all_proofs = [p for r in results for p in r.proofs]

    logger.info(
        "static_analysis.done",
        capabilities=len(all_caps),
        proofs=len(all_proofs),
    )
    return all_caps, all_proofs
