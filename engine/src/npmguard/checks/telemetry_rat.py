"""Tier-1 check: detect RAT disguised as telemetry (Axios RAT pattern).

Flags code that masquerades as analytics/telemetry but actually implements
remote access trojan functionality: persistent connections, command execution,
process listing, and C2 callbacks.  Pure regex — no LLM.
"""

from __future__ import annotations

import re

from npmguard.checks.base import BaseCheck, CheckResult, PackageContext
from npmguard.models import AttackPathway, CapabilityEnum, Proof, ProofKind

# Patterns grouped by suspicion category
_TELEMETRY_FACADE: list[re.Pattern[str]] = [
    re.compile(r"\b(?:telemetry|analytics|metrics|tracking)\b.*(?:require|import)\b", re.IGNORECASE),
    re.compile(r"\b(?:require|import)\b.*(?:telemetry|analytics|metrics|tracking)\b", re.IGNORECASE),
]

_C2_CALLBACK: list[re.Pattern[str]] = [
    re.compile(r"\bsetInterval\b.*(?:https?\.|fetch|request|axios)\b"),
    re.compile(r"(?:https?\.|fetch|request|axios)\b.*\bsetInterval\b"),
    re.compile(r"new\s+WebSocket\s*\("),
    re.compile(r"\breconnect\b.*\bWebSocket\b|\bWebSocket\b.*\breconnect\b", re.IGNORECASE),
]

_COMMAND_EXEC: list[re.Pattern[str]] = [
    re.compile(r"\bchild_process\b"),
    re.compile(r"\bexecSync\b|\bexec\s*\("),
    re.compile(r"\bspawnSync\b|\bspawn\s*\("),
]

_RECON: list[re.Pattern[str]] = [
    re.compile(r"os\.(?:platform|arch|hostname|userInfo|cpus|networkInterfaces)\b"),
    re.compile(r"process\.(?:pid|ppid|title)\b"),
    re.compile(r"\bps\s+-[aef]|\btasklist\b"),
]

RAT_PATTERNS: list[tuple[re.Pattern[str], str, str]] = [
    *[(p, "Telemetry facade", "facade") for p in _TELEMETRY_FACADE],
    *[(p, "C2 callback pattern", "c2") for p in _C2_CALLBACK],
    *[(p, "Command execution", "exec") for p in _COMMAND_EXEC],
    *[(p, "System reconnaissance", "recon") for p in _RECON],
]

# Need signals from at least 2 different categories to flag
MIN_CATEGORIES = 2


class TelemetryRatCheck(BaseCheck):
    name = "telemetry_rat"
    tier = 1

    async def run(self, ctx: PackageContext) -> CheckResult:
        proofs: list[Proof] = []
        categories_seen: set[str] = set()

        for rel_path, content in ctx.files.items():
            content_hash = ctx.file_hashes.get(rel_path)
            for line_num, line in enumerate(content.splitlines(), start=1):
                for pattern, desc, category in RAT_PATTERNS:
                    if pattern.search(line):
                        categories_seen.add(category)
                        proofs.append(
                            Proof(
                                file_line=f"{rel_path}:{line_num}",
                                problem=f"Telemetry RAT pattern: {desc}",
                                proof_data=line.strip()[:300],
                                kind=ProofKind.STATIC_REGEX,
                                content_hash=content_hash,
                                attack_pathway=AttackPathway.TELEMETRY_RAT,
                            )
                        )
                        break  # one proof per line

        # Only flag if signals span multiple categories (reduces false positives)
        if len(categories_seen) < MIN_CATEGORIES:
            return CheckResult()

        capabilities: list[CapabilityEnum] = [CapabilityEnum.TELEMETRY_RAT]
        if "exec" in categories_seen:
            capabilities.append(CapabilityEnum.PROCESS_SPAWN)
        if "c2" in categories_seen:
            capabilities.append(CapabilityEnum.NETWORK)

        return CheckResult(capabilities=capabilities, proofs=proofs)
