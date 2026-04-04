"""Pluggable check system for static analysis."""

from npmguard.checks.anti_ai_prompt import AntiAiPromptCheck
from npmguard.checks.base import BaseCheck, CheckResult, PackageContext, build_context
from npmguard.checks.build_plugin_exfil import BuildPluginExfilCheck
from npmguard.checks.clipboard_hijack import ClipboardHijackCheck
from npmguard.checks.lifecycle_hook import LifecycleHookCheck
from npmguard.checks.network_exfil import NetworkExfilCheck
from npmguard.checks.telemetry_rat import TelemetryRatCheck
from npmguard.checks.worm_propagation import WormPropagationCheck

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
    ClipboardHijackCheck(),
    TelemetryRatCheck(),
    BuildPluginExfilCheck(),
    WormPropagationCheck(),
]
