"""Pluggable check system for static analysis."""

from npmguard.checks.anti_ai_prompt import AntiAiPromptCheck
from npmguard.checks.base import BaseCheck, CheckResult, PackageContext, build_context
from npmguard.checks.lifecycle_hook import LifecycleHookCheck
from npmguard.checks.network_exfil import NetworkExfilCheck

__all__ = [
    "CHECKS",
    "BaseCheck",
    "CheckResult",
    "PackageContext",
    "build_context",
]

CHECKS: list[BaseCheck] = [
    AntiAiPromptCheck(),
    LifecycleHookCheck(),
    NetworkExfilCheck(),
]
