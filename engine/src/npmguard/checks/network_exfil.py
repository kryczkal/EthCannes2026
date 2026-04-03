"""Tier-1 check: detect network exfiltration patterns (regex → LLM confirmation)."""

from __future__ import annotations

import re
from dataclasses import dataclass

from pydantic import BaseModel, Field
from pydantic_ai import Agent, ModelRetry, RunContext

from npmguard.checks.base import BaseCheck, CheckResult, PackageContext
from npmguard.llm import make_model
from npmguard.models import CapabilityEnum, Proof

# ---------------------------------------------------------------------------
# Regex patterns for initial signal detection
# ---------------------------------------------------------------------------

NETWORK_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p)
    for p in [
        r"\bfetch\s*\(",
        r"\bhttps?\.(request|get|post)\b",
        r"\bXMLHttpRequest\b",
        r"\bundici\b",
        r"\bdns\.(lookup|resolve)\b",
        r"169\.254\.169\.254",  # AWS IMDS
        r"\brequire\(['\"](?:node:)?https?['\"]\)",
    ]
]

CONTEXT_LINES = 3  # lines of surrounding context to show the LLM


# ---------------------------------------------------------------------------
# Internal types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Signal:
    rel_path: str
    line_num: int
    line: str
    context: str  # surrounding lines for LLM


class NetworkFinding(BaseModel):
    """A single network-related finding confirmed by the LLM."""

    file_line: str = Field(description="e.g. 'src/index.js:42'")
    problem: str = Field(description="One-sentence description of the threat")
    proof_data: str = Field(description="The exact suspicious code snippet")
    is_exfil: bool = Field(
        description="True if data is being sent OUT (POST, DNS encode, etc.)"
    )


class NetworkAnalysis(BaseModel):
    """Structured output from the LLM analysis."""

    findings: list[NetworkFinding] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# PydanticAI agent (lazy-initialized)
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are a security auditor analyzing an npm package for network exfiltration.

You will receive code snippets that triggered network-related regex patterns.
For each snippet, determine if it represents a genuine security threat.

Benign examples to IGNORE:
- A package that IS an HTTP client making requests (e.g., axios, got, node-fetch)
- Fetching package metadata from the npm registry
- Loading local config files

Suspicious examples to FLAG:
- POST requests sending process.env, credentials, or tokens to unknown servers
- DNS lookups encoding data in subdomains (DNS exfiltration)
- HTTP requests to cloud metadata services (169.254.169.254)
- Downloading and executing binaries from remote servers
- Any network call inside a preinstall/postinstall hook

Only output findings for genuinely suspicious patterns. Be precise with file_line references.
"""


@dataclass
class _Deps:
    ctx: PackageContext
    signals: list[Signal]


_agent: Agent[_Deps, NetworkAnalysis] | None = None


def _get_agent() -> Agent[_Deps, NetworkAnalysis]:
    global _agent
    if _agent is None:
        _agent = Agent(
            make_model(),
            deps_type=_Deps,
            output_type=NetworkAnalysis,
            retries=2,
            system_prompt=SYSTEM_PROMPT,
        )

        @_agent.output_validator
        def _validate(
            ctx: RunContext[_Deps], output: NetworkAnalysis  # noqa: ARG001
        ) -> NetworkAnalysis:
            for f in output.findings:
                if ":" not in f.file_line:
                    raise ModelRetry(
                        f"file_line '{f.file_line}' must be 'filename:linenum' format"
                    )
            return output

    return _agent


# ---------------------------------------------------------------------------
# Check implementation
# ---------------------------------------------------------------------------


def _extract_context(content: str, line_num: int) -> str:
    """Return a few lines around *line_num* (1-indexed)."""
    lines = content.splitlines()
    start = max(0, line_num - 1 - CONTEXT_LINES)
    end = min(len(lines), line_num + CONTEXT_LINES)
    numbered = [f"{i + 1}: {lines[i]}" for i in range(start, end)]
    return "\n".join(numbered)


def _collect_signals(ctx: PackageContext) -> list[Signal]:
    signals: list[Signal] = []
    for rel_path, content in ctx.files.items():
        for line_num, line in enumerate(content.splitlines(), start=1):
            for pattern in NETWORK_PATTERNS:
                if pattern.search(line):
                    signals.append(
                        Signal(
                            rel_path=rel_path,
                            line_num=line_num,
                            line=line.strip(),
                            context=_extract_context(content, line_num),
                        )
                    )
                    break  # one signal per line
    return signals


def _build_user_prompt(ctx: PackageContext, signals: list[Signal]) -> str:
    parts = [
        f"Package: {ctx.package_name}@{ctx.version}",
        f"Description: {ctx.description}",
    ]
    if ctx.lifecycle_hooks:
        hooks = ", ".join(f"{k}={v!r}" for k, v in ctx.lifecycle_hooks.items())
        parts.append(f"Lifecycle hooks: {hooks}")

    parts.append("\n=== NETWORK SIGNALS ===\n")
    for sig in signals:
        parts.append(f"[{sig.rel_path}:{sig.line_num}]")
        parts.append(sig.context)
        parts.append("")

    return "\n".join(parts)


class NetworkExfilCheck(BaseCheck):
    name = "network_exfil"
    tier = 1

    async def run(self, ctx: PackageContext) -> CheckResult:
        signals = _collect_signals(ctx)
        if not signals:
            return CheckResult()

        agent = _get_agent()
        deps = _Deps(ctx=ctx, signals=signals)
        prompt = _build_user_prompt(ctx, signals)

        result = await agent.run(prompt, deps=deps)
        analysis: NetworkAnalysis = result.output

        if not analysis.findings:
            return CheckResult()

        capabilities: list[CapabilityEnum] = [CapabilityEnum.NETWORK]
        if any(f.is_exfil for f in analysis.findings):
            capabilities.append(CapabilityEnum.DNS_EXFIL)

        proofs = [
            Proof(
                file_line=f.file_line,
                problem=f.problem,
                proof_data=f.proof_data[:300],
            )
            for f in analysis.findings
        ]

        return CheckResult(capabilities=capabilities, proofs=proofs)
