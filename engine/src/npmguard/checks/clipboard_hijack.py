"""Tier-1 check: detect clipboard hijacking patterns (Qix/chalk attack).

Flags code that monitors or manipulates the system clipboard, particularly
patterns that replace cryptocurrency addresses with attacker-controlled ones.
Pure regex — no LLM.
"""

from __future__ import annotations

import re

from npmguard.checks.base import BaseCheck, CheckResult, PackageContext
from npmguard.models import AttackPathway, CapabilityEnum, Proof, ProofKind

CLIPBOARD_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bnavigator\.clipboard\b"), "Clipboard API access"),
    (re.compile(r"\bclipboard\.writeText\b"), "Clipboard write"),
    (re.compile(r"\bclipboard\.readText\b"), "Clipboard read"),
    (re.compile(r"document\.execCommand\s*\(\s*['\"]copy['\"]"), "Legacy clipboard copy"),
    (re.compile(r"document\.execCommand\s*\(\s*['\"]paste['\"]"), "Legacy clipboard paste"),
    (re.compile(r"\bclipboardData\b"), "ClipboardData access"),
    # Crypto address regex replacement patterns
    (re.compile(r"replace\s*\([^)]*\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b"), "BTC address replacement"),
    (re.compile(r"replace\s*\([^)]*0x[a-fA-F0-9]{40}"), "ETH address replacement"),
    # Watching for clipboard events
    (re.compile(r"addEventListener\s*\(\s*['\"](?:copy|cut|paste)['\"]"), "Clipboard event listener"),
    # Electron / Node clipboard modules
    (re.compile(r"require\s*\(\s*['\"](?:clipboardy|copy-paste|node-copy-paste)['\"]"), "Clipboard module import"),
    (re.compile(r"electron\.clipboard"), "Electron clipboard access"),
]


class ClipboardHijackCheck(BaseCheck):
    name = "clipboard_hijack"
    tier = 1

    async def run(self, ctx: PackageContext) -> CheckResult:
        proofs: list[Proof] = []

        for rel_path, content in ctx.files.items():
            content_hash = ctx.file_hashes.get(rel_path)
            for line_num, line in enumerate(content.splitlines(), start=1):
                for pattern, desc in CLIPBOARD_PATTERNS:
                    if pattern.search(line):
                        proofs.append(
                            Proof(
                                file_line=f"{rel_path}:{line_num}",
                                problem=f"Clipboard hijack pattern: {desc}",
                                proof_data=line.strip()[:300],
                                kind=ProofKind.STATIC_REGEX,
                                content_hash=content_hash,
                                attack_pathway=AttackPathway.ACCOUNT_TAKEOVER_CRYPTO,
                            )
                        )
                        break  # one proof per line

        if not proofs:
            return CheckResult()

        return CheckResult(
            capabilities=[CapabilityEnum.CLIPBOARD_HIJACK],
            proofs=proofs,
        )
