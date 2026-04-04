"""Temporal activity for Phase 1b — agentic investigation."""

from __future__ import annotations

import json

import structlog
from temporalio import activity

from npmguard.config import Settings
from npmguard.investigation.agent import (
    InvestigationDeps,
    build_investigation_agent,
    build_user_prompt,
)
from npmguard.investigation.models import Confidence, InvestigationInput
from npmguard.models import CapabilityEnum, Proof, ProofKind
from npmguard.sandbox import make_sandbox

log = structlog.get_logger()

# Map confidence levels to ProofKind
_CONFIDENCE_TO_KIND = {
    Confidence.SUSPECTED: ProofKind.AI_STATIC,
    Confidence.LIKELY: ProofKind.AI_STATIC,
    Confidence.CONFIRMED: ProofKind.AI_DYNAMIC,
}


@activity.defn
async def investigate_package(
    input: InvestigationInput,
) -> tuple[list[CapabilityEnum], list[Proof]]:
    """Phase 1b: Run the investigation agent against the package.

    Creates an ephemeral Docker sandbox, runs the pydantic-ai agent loop,
    and converts findings to Proofs.
    """
    settings = Settings()

    if not settings.investigation_enabled:
        log.info("investigation.disabled")
        return [], []

    log.info(
        "investigation.start",
        package=input.package_name,
        path=input.package_path,
        flags=len(input.flags),
    )

    sandbox = make_sandbox(settings)

    try:
        await sandbox.start(input.package_path)

        # Parse lifecycle hooks from package.json
        pkg_json_path = f"{input.package_path}/package.json"
        lifecycle_hooks: dict[str, str] = {}
        try:
            with open(pkg_json_path) as f:
                pkg = json.load(f)
            scripts = pkg.get("scripts", {})
            hook_keys = {"preinstall", "postinstall", "install", "prepare"}
            lifecycle_hooks = {k: v for k, v in scripts.items() if k in hook_keys}
        except (OSError, json.JSONDecodeError):
            pass

        deps = InvestigationDeps(
            package_path=input.package_path,
            sandbox=sandbox,
            lifecycle_hooks=lifecycle_hooks,
        )

        agent = build_investigation_agent()
        prompt = build_user_prompt(input.model_dump())

        result = await agent.run(prompt, deps=deps)
        output = result.output

        # Also collect kernel-level trace if available
        trace_log = await sandbox.get_trace_log()
        if trace_log:
            log.info("investigation.kernel_trace", events=len(trace_log))

        # Convert findings to Proofs
        capabilities: list[CapabilityEnum] = []
        proofs: list[Proof] = []

        for finding in output.findings:
            # Map capability string to enum (best effort)
            try:
                cap = CapabilityEnum(finding.capability)
            except ValueError:
                log.warning("investigation.unknown_capability", cap=finding.capability)
                continue

            if cap not in capabilities:
                capabilities.append(cap)

            kind = _CONFIDENCE_TO_KIND.get(finding.confidence, ProofKind.AI_STATIC)

            proofs.append(
                Proof(
                    capability=cap,
                    confidence=finding.confidence,
                    file_line=finding.file_line,
                    problem=finding.problem,
                    evidence=finding.evidence[:500],
                    kind=kind,
                    reproducible=finding.confidence == Confidence.CONFIRMED,
                    reproduction_cmd=finding.reproduction_strategy or None,
                )
            )

        log.info(
            "investigation.done",
            findings=len(output.findings),
            capabilities=[c.value for c in capabilities],
            proofs=len(proofs),
            tool_calls=len(deps.call_log),
            injections_detected=sum(1 for t in deps.call_log if t.injection_detected),
        )

        return capabilities, proofs

    except Exception:
        log.exception("investigation.failed", package=input.package_name)
        return [], []
    finally:
        await sandbox.stop()
