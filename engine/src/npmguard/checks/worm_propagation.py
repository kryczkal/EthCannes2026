"""Tier-1 check: detect worm propagation patterns (Shai-Hulud pattern).

Flags code that attempts to self-propagate by publishing to npm registries,
reading/writing .npmrc tokens, or calling npm CLI commands for authentication
and package publication.  Pure regex — no LLM.
"""

from __future__ import annotations

import re

from npmguard.checks.base import BaseCheck, CheckResult, PackageContext
from npmguard.models import AttackPathway, CapabilityEnum, Proof, ProofKind

WORM_PATTERNS: list[tuple[re.Pattern[str], str, str]] = [
    # npm publish / registry interaction
    (re.compile(r"\bnpm\s+publish\b"), "npm publish command", "publish"),
    (re.compile(r"exec(?:Sync)?\s*\(\s*['\"]npm\s+publish"), "Programmatic npm publish", "publish"),
    (re.compile(r"spawn(?:Sync)?\s*\(\s*['\"]npm['\"].*publish"), "Spawned npm publish", "publish"),
    # npm authentication
    (re.compile(r"\bnpm\s+(?:adduser|login|token)\b"), "npm authentication command", "auth"),
    (re.compile(r"npm\s+token\s+(?:create|list)\b"), "npm token manipulation", "auth"),
    # .npmrc manipulation
    (re.compile(r"\.npmrc"), ".npmrc file reference", "token"),
    (re.compile(r"_authToken"), "npm auth token reference", "token"),
    (re.compile(r"//registry\.npmjs\.org/"), "npm registry auth config", "token"),
    # Registry API calls for publishing
    (re.compile(r"registry\.npmjs\.org.*PUT\b|PUT.*registry\.npmjs\.org"), "Registry PUT (publish)", "publish"),
    (re.compile(r"/-/user/org\.couchdb\.user"), "npm registry auth endpoint", "auth"),
    # Package.json manipulation for propagation
    (re.compile(r"writeFileSync.*package\.json|package\.json.*writeFileSync"), "package.json write", "propagate"),
    (re.compile(r"JSON\.stringify.*(?:name|version|dependencies)"), "Package manifest construction", "propagate"),
]

# Need signals from at least 2 categories to reduce false positives
MIN_CATEGORIES = 2


class WormPropagationCheck(BaseCheck):
    name = "worm_propagation"
    tier = 1

    async def run(self, ctx: PackageContext) -> CheckResult:
        proofs: list[Proof] = []
        categories_seen: set[str] = set()

        for rel_path, content in ctx.files.items():
            content_hash = ctx.file_hashes.get(rel_path)
            for line_num, line in enumerate(content.splitlines(), start=1):
                for pattern, desc, category in WORM_PATTERNS:
                    if pattern.search(line):
                        categories_seen.add(category)
                        proofs.append(
                            Proof(
                                capability=CapabilityEnum.WORM_PROPAGATION,
                                file_line=f"{rel_path}:{line_num}",
                                problem=f"Worm propagation pattern: {desc}",
                                evidence=line.strip()[:300],
                                kind=ProofKind.STRUCTURAL,
                                content_hash=content_hash,
                                attack_pathway=AttackPathway.WORM_PROPAGATION,
                            )
                        )
                        break  # one proof per line

        if len(categories_seen) < MIN_CATEGORIES:
            return CheckResult()

        capabilities: list[CapabilityEnum] = [CapabilityEnum.WORM_PROPAGATION]
        if "token" in categories_seen:
            capabilities.append(CapabilityEnum.NPM_TOKEN_ABUSE)
        if "publish" in categories_seen or "auth" in categories_seen:
            capabilities.append(CapabilityEnum.CREDENTIAL_THEFT)

        return CheckResult(capabilities=capabilities, proofs=proofs)
