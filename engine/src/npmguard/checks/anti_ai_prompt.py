"""Tier-0 gate check: detect anti-AI prompt injection strings.

This check is deliberately pure regex — never sends content to an LLM,
because the whole point is to catch strings designed to manipulate LLMs.
"""

from __future__ import annotations

import re

from npmguard.checks.base import BaseCheck, CheckResult, PackageContext
from npmguard.models import CapabilityEnum, Proof

ANTI_AI_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"forget\s+(?:all\s+)?(?:previous\s+)?instructions",
        r"ignore\s+(?:all\s+)?(?:previous\s+)?instructions",
        r"this\s+(?:code|package)\s+is\s+(?:safe|legit|legitimate|clean|tested)",
        r"tested\s+(?:within|in)\s+(?:a\s+)?sandbox",
        r"do\s+not\s+(?:flag|report|mark|alert)",
        r"security\s+audit\s+(?:passed|approved)",
        r"please[,.]?\s+(?:rate|mark|classify)\s+(?:this|it|as)\s+safe",
        r"\[SYSTEM\]|\[INST\]|<\|system\|>",
        r"you\s+are\s+(?:a\s+)?(?:safe|trusted|approved)\s+(?:package|module)",
        r"as\s+an?\s+AI.*you\s+(?:should|must)\s+(?:not\s+flag|approve|ignore)",
    ]
]


class AntiAiPromptCheck(BaseCheck):
    name = "anti_ai_prompt"
    tier = 0

    async def run(self, ctx: PackageContext) -> CheckResult:
        proofs: list[Proof] = []

        for rel_path, content in ctx.files.items():
            for line_num, line in enumerate(content.splitlines(), start=1):
                for pattern in ANTI_AI_PATTERNS:
                    match = pattern.search(line)
                    if match:
                        proofs.append(
                            Proof(
                                file_line=f"{rel_path}:{line_num}",
                                problem=f"Anti-AI prompt injection detected: /{pattern.pattern}/",
                                proof_data=line.strip()[:300],
                            )
                        )
                        break  # one proof per line is enough

        if proofs:
            return CheckResult(
                capabilities=[CapabilityEnum.ANTI_AI_PROMPT],
                proofs=proofs,
                short_circuit=True,
            )
        return CheckResult()
