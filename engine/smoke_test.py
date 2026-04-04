#!/usr/bin/env python3
"""
Smoke test — run static analysis checks against all test fixtures without Temporal.

Usage:
    cd engine && uv run python smoke_test.py
    cd engine && uv run python smoke_test.py test-pkg-lifecycle-hook   # single package
    cd engine && uv run python smoke_test.py --no-llm                  # skip LLM checks
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import TYPE_CHECKING

# Ensure src/ is importable
sys.path.insert(0, str(Path(__file__).parent / "src"))

from npmguard.checks import CHECKS
from npmguard.checks.base import BaseCheck, CheckResult, build_context

if TYPE_CHECKING:
    from npmguard.models import CapabilityEnum, Proof

FIXTURES_DIR = Path(__file__).parent.parent / "sandbox" / "test-fixtures"

# Checks that require an LLM API key
LLM_CHECKS = {"network_exfil"}


async def run_checks(
    package_dir: Path, checks: list[BaseCheck]
) -> tuple[list[CapabilityEnum], list[Proof]]:
    """Run all registered checks against a package directory."""
    ctx = await build_context(str(package_dir))
    print(f"  Context: {len(ctx.files)} files, hooks={list(ctx.lifecycle_hooks.keys()) or 'none'}")

    # Tier 0 — gate checks
    for check in [c for c in checks if c.tier == 0]:
        result = await check.run(ctx)
        if result.short_circuit:
            print(f"  ⚡ SHORT-CIRCUIT by {check.name}")
            return result.capabilities, result.proofs

    # Tier 1 — parallel checks (isolate failures)
    tier1 = [c for c in checks if c.tier == 1]

    async def _safe_run(check: BaseCheck) -> CheckResult:
        try:
            return await check.run(ctx)
        except Exception as exc:
            print(f"  ⚠ {check.name} failed: {exc}")
            return CheckResult()

    results: list[CheckResult] = list(await asyncio.gather(*[_safe_run(c) for c in tier1]))

    all_caps = list({cap for r in results for cap in r.capabilities})
    all_proofs = [p for r in results for p in r.proofs]
    return all_caps, all_proofs


async def main() -> None:
    no_llm = "--no-llm" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]

    # Filter checks
    checks = [c for c in CHECKS if not (no_llm and c.name in LLM_CHECKS)]

    # Determine which packages to test
    if args:
        packages = []
        for name in args:
            pkg_dir = FIXTURES_DIR / name
            if not pkg_dir.is_dir():
                print(f"ERROR: fixture not found: {pkg_dir}")
                sys.exit(1)
            packages.append(pkg_dir)
    else:
        packages = sorted(
            p for p in FIXTURES_DIR.iterdir() if p.is_dir() and p.name.startswith("test-pkg-")
        )

    if not packages:
        print(f"No test fixtures found in {FIXTURES_DIR}")
        sys.exit(1)

    print(f"Running {len(checks)} checks against {len(packages)} packages")
    if no_llm:
        print("  (LLM checks skipped — use without --no-llm to include them)")
    print(f"\nChecks: {', '.join(c.name for c in checks)}")
    print(f"{'=' * 70}\n")

    for pkg_dir in packages:
        print(f"📦 {pkg_dir.name}")
        try:
            caps, proofs = await run_checks(pkg_dir, checks)
        except Exception as exc:
            print(f"  ❌ ERROR: {exc}\n")
            continue

        if not caps and not proofs:
            print("  ✅ Clean — no findings")
        else:
            print(f"  Capabilities: {', '.join(c.value for c in caps)}")
            print(f"  Proofs ({len(proofs)}):")
            for proof in proofs:
                print(f"    [{proof.file_line}] {proof.problem}")
                if proof.proof_data:
                    data = proof.proof_data[:120]
                    if len(proof.proof_data) > 120:
                        data += "..."
                    print(f"      → {data}")
        print()


if __name__ == "__main__":
    asyncio.run(main())
