"""Layer 1 — Static Analysis activity.

Runs a pipeline of pluggable checks over an extracted npm package directory.
No code is executed; analysis is purely static (regex + optional LLM reasoning).
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

import structlog
from temporalio import activity

if TYPE_CHECKING:
    from collections.abc import Awaitable

from npmguard.checks import CHECKS
from npmguard.checks.base import CheckResult, build_context
from npmguard.models import CapabilityEnum, Proof  # noqa: TC001

log = structlog.get_logger()


async def _run_check_safe(check_name: str, coro: Awaitable[CheckResult]) -> CheckResult:
    """Wrap a check coroutine so a single failure doesn't kill the pipeline."""
    try:
        return await coro
    except Exception:
        log.exception("static_analysis.check_failed", check=check_name)
        return CheckResult()


@activity.defn
async def analyze_static(package_path: str) -> tuple[list[CapabilityEnum], list[Proof]]:
    """Layer 1: Static Analysis Engine.

    Runs without executing the codebase.  Each registered check scans the
    package for a specific class of threat and returns structured findings.
    """
    ctx = await build_context(package_path)
    log.info(
        "static_analysis.start",
        package=ctx.package_name,
        files=len(ctx.files),
        checks=len(CHECKS),
    )

    # Tier 0 — gate checks (sequential, can short-circuit)
    for check in [c for c in CHECKS if c.tier == 0]:
        result = await check.run(ctx)
        if result.short_circuit:
            log.warning(
                "static_analysis.short_circuit",
                check=check.name,
                proofs=len(result.proofs),
            )
            return result.capabilities, result.proofs

    # Tier 1 — all other checks (parallel, isolated failures)
    tier1 = [c for c in CHECKS if c.tier == 1]
    results: list[CheckResult] = list(
        await asyncio.gather(*[_run_check_safe(c.name, c.run(ctx)) for c in tier1])
    )

    # Aggregate (order-preserving dedup)
    all_caps = list(dict.fromkeys(cap for r in results for cap in r.capabilities))
    all_proofs = [p for r in results for p in r.proofs]

    log.info(
        "static_analysis.done",
        capabilities=len(all_caps),
        proofs=len(all_proofs),
    )
    return all_caps, all_proofs
