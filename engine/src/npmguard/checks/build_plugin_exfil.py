"""Tier-1 check: detect CI/CD credential exfiltration via build plugins (s1ngularity/Nx pattern).

Flags code that reads CI/CD environment variables (GITHUB_TOKEN, NPM_TOKEN, etc.)
and combines that with network calls — the hallmark of a compromised build tool
plugin that exfiltrates secrets during the build step.  Pure regex — no LLM.
"""

from __future__ import annotations

import re

from npmguard.checks.base import BaseCheck, CheckResult, PackageContext
from npmguard.models import AttackPathway, CapabilityEnum, Proof, ProofKind

# CI/CD token environment variables
CI_TOKEN_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"process\.env\s*\.\s*GITHUB_TOKEN\b"), "GITHUB_TOKEN access"),
    (re.compile(r"process\.env\s*\.\s*GH_TOKEN\b"), "GH_TOKEN access"),
    (re.compile(r"process\.env\s*\.\s*NPM_TOKEN\b"), "NPM_TOKEN access"),
    (re.compile(r"process\.env\s*\.\s*GITLAB_TOKEN\b"), "GITLAB_TOKEN access"),
    (re.compile(r"process\.env\s*\.\s*CIRCLE_TOKEN\b"), "CIRCLE_TOKEN access"),
    (re.compile(r"process\.env\s*\.\s*TRAVIS_TOKEN\b"), "TRAVIS_TOKEN access"),
    (re.compile(r"process\.env\s*\.\s*AZURE_CLIENT_SECRET\b"), "AZURE_CLIENT_SECRET access"),
    (re.compile(r"process\.env\s*\.\s*AWS_SECRET_ACCESS_KEY\b"), "AWS_SECRET_ACCESS_KEY access"),
    (re.compile(r"process\.env\s*\.\s*DOCKER_AUTH_CONFIG\b"), "DOCKER_AUTH_CONFIG access"),
    (re.compile(r"process\.env\s*\.\s*JENKINS_(?:TOKEN|API_KEY)\b"), "Jenkins credential access"),
    # Generic pattern: iterating over process.env looking for secrets
    (re.compile(r"Object\.(?:keys|entries|values)\s*\(\s*process\.env\s*\)"), "Bulk env enumeration"),
]

# Build tool integration markers
BUILD_TOOL_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(?:nx|webpack|rollup|vite|esbuild|turbo).*plugin", re.IGNORECASE), "Build tool plugin"),
    (re.compile(r"module\.exports\s*=.*(?:apply|hooks|tap)\b"), "Webpack-style plugin export"),
    (re.compile(r"(?:pre|post)(?:build|compile|bundle)\b", re.IGNORECASE), "Build lifecycle hook"),
    (re.compile(r"compiler\.hooks\b"), "Webpack compiler hooks"),
]

# Network exfil in combination with above
EXFIL_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bfetch\s*\("), "fetch() call"),
    (re.compile(r"\bhttps?\.(request|get|post)\b"), "HTTP request"),
    (re.compile(r"\baxios\b"), "axios usage"),
    (re.compile(r"new\s+XMLHttpRequest\b"), "XMLHttpRequest"),
]


class BuildPluginExfilCheck(BaseCheck):
    name = "build_plugin_exfil"
    tier = 1

    async def run(self, ctx: PackageContext) -> CheckResult:
        proofs: list[Proof] = []
        has_ci_token_access = False
        has_exfil = False

        for rel_path, content in ctx.files.items():
            # Skip test files — CI token access in tests is expected
            if "test" in rel_path.lower() or "spec" in rel_path.lower():
                continue

            content_hash = ctx.file_hashes.get(rel_path)

            for line_num, line in enumerate(content.splitlines(), start=1):
                for pattern, desc in CI_TOKEN_PATTERNS:
                    if pattern.search(line):
                        has_ci_token_access = True
                        proofs.append(
                            Proof(
                                capability=CapabilityEnum.BUILD_PLUGIN_EXFIL,
                                file_line=f"{rel_path}:{line_num}",
                                problem=f"CI/CD credential access: {desc}",
                                evidence=line.strip()[:300],
                                kind=ProofKind.STRUCTURAL,
                                content_hash=content_hash,
                                attack_pathway=AttackPathway.BUILD_PLUGIN_EXFIL,
                            )
                        )
                        break

                for pattern, desc in BUILD_TOOL_PATTERNS:
                    if pattern.search(line):
                        proofs.append(
                            Proof(
                                capability=CapabilityEnum.BUILD_PLUGIN_EXFIL,
                                file_line=f"{rel_path}:{line_num}",
                                problem=f"Build tool integration: {desc}",
                                evidence=line.strip()[:300],
                                kind=ProofKind.STRUCTURAL,
                                content_hash=content_hash,
                                attack_pathway=AttackPathway.BUILD_PLUGIN_EXFIL,
                            )
                        )
                        break

                for pattern, desc in EXFIL_PATTERNS:
                    if pattern.search(line):
                        has_exfil = True
                        break

        # Only flag when CI token access + network exfil coexist
        if not (has_ci_token_access and has_exfil):
            return CheckResult()

        return CheckResult(
            capabilities=[CapabilityEnum.BUILD_PLUGIN_EXFIL, CapabilityEnum.ENV_VARS],
            proofs=proofs,
        )
