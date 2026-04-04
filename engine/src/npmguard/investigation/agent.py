"""Phase 1b investigation agent — pydantic-ai Agent with sandbox tools.

The agent reads package code, forms hypotheses, executes snippets in the
Docker sandbox, and produces structured findings with confidence levels.
"""

from __future__ import annotations

import functools
import json
from dataclasses import dataclass, field

from pydantic_ai import Agent, RunContext

from npmguard.investigation.models import (
    Finding,
    InvestigationOutput,
    ToolCallRecord,
)
from npmguard.investigation.tools_execute import (
    eval_js as _eval_js,
    fast_forward_timers as _fast_forward_timers,
    require_and_trace as _require_and_trace,
    run_lifecycle_hook as _run_lifecycle_hook,
)
from npmguard.investigation.tools_read import (
    list_files as _list_files,
    read_file as _read_file,
    search_files as _search_files,
)
from npmguard.llm import make_model
from npmguard.sandbox.controller import SandboxController

SYSTEM_PROMPT = """\
You are a senior security researcher investigating an npm package for malicious behavior.

## Your Mission
Determine whether this package contains malicious code. Produce concrete findings with evidence.

## Investigation Strategy
1. Start by listing files to understand the package structure.
2. Read the entry point and any files flagged by prior analysis.
3. Follow require chains, trace data flow, look for obfuscation.
4. If you see obfuscated code (base64, hex escapes, XOR, string concatenation), use eval_js() to decode it.
5. Use require_and_trace() to execute the package with full instrumentation and observe actual behavior.
6. If the package has lifecycle hooks (preinstall/postinstall), investigate those FIRST — they are the highest risk.
7. If you suspect a time-gated payload (setTimeout with large delay), use fast_forward_timers() to trigger it.

## Confidence Levels
- SUSPECTED: Code pattern looks suspicious but you haven't confirmed behavior
- LIKELY: Multiple corroborating signals (e.g., obfuscated string that decodes to a URL + network import)
- CONFIRMED: You observed the behavior in sandbox execution (require_and_trace showed network call, eval_js decoded the payload, etc.)

## Output
For each finding, specify:
- The exact capability (NETWORK, FILESYSTEM, ENV_VARS, CREDENTIAL_THEFT, EVAL, OBFUSCATION, etc.)
- The file and line range with the suspicious code
- Concrete evidence (decoded strings, trace log entries, etc.)
- A reproduction strategy describing how to write a test that proves this behavior

Be thorough but focused. Follow leads from the prior static analysis. Do not flag benign patterns (legitimate HTTP clients, standard file operations for a package's stated purpose).
"""


@dataclass
class InvestigationDeps:
    """Mutable context shared by all tools during an investigation."""

    package_path: str
    sandbox: SandboxController
    lifecycle_hooks: dict[str, str]
    call_log: list[ToolCallRecord] = field(default_factory=list)


def _record(deps: InvestigationDeps, tool: str, args: dict, result: str, injection: bool = False) -> None:
    deps.call_log.append(
        ToolCallRecord(
            tool=tool,
            args=args,
            result_preview=result[:500],
            injection_detected=injection,
        )
    )


@functools.lru_cache(maxsize=1)
def build_investigation_agent() -> Agent[InvestigationDeps, InvestigationOutput]:
    """Build and return the investigation agent (singleton)."""
    agent: Agent[InvestigationDeps, InvestigationOutput] = Agent(
        make_model(),
        deps_type=InvestigationDeps,
        output_type=InvestigationOutput,
        retries=2,
        system_prompt=SYSTEM_PROMPT,
    )

    # ----- READ TOOLS (host-side) -----

    @agent.tool
    async def read_file(ctx: RunContext[InvestigationDeps], path: str) -> str:
        """Read a file from the package. Path is relative to package root."""
        result = _read_file(ctx.deps.package_path, path)
        _record(ctx.deps, "read_file", {"path": path}, result)
        return result

    @agent.tool
    async def list_files(ctx: RunContext[InvestigationDeps]) -> str:
        """List all files in the package with sizes and extensions."""
        result = _list_files(ctx.deps.package_path)
        _record(ctx.deps, "list_files", {}, result)
        return result

    @agent.tool
    async def search_files(ctx: RunContext[InvestigationDeps], pattern: str) -> str:
        """Regex search across all text files in the package. Returns matches with surrounding context."""
        result = _search_files(ctx.deps.package_path, pattern)
        _record(ctx.deps, "search_files", {"pattern": pattern}, result)
        return result

    # ----- EXECUTE TOOLS (Docker sandbox) -----

    @agent.tool
    async def eval_js(ctx: RunContext[InvestigationDeps], code: str) -> str:
        """Execute a JavaScript snippet in the sandbox. Use for deobfuscation:
        e.g., eval_js("console.log(atob('Y2hpbGRfcHJvY2Vzcw=='))") to decode base64.
        Returns stdout + stderr. Hard timeout applies."""
        result = await _eval_js(ctx.deps.sandbox, code)
        _record(ctx.deps, "eval_js", {"code": code[:200]}, result)
        return result

    @agent.tool
    async def require_and_trace(ctx: RunContext[InvestigationDeps], entrypoint: str) -> str:
        """Load a package entry point with full Node.js instrumentation.
        Monkey-patches require, fs, http, child_process, process.env, crypto, eval, timers.
        Returns a structured trace log of everything the package did.
        The entrypoint should be relative to the package root (e.g., 'index.js' or 'lib/main.js')."""
        result = await _require_and_trace(ctx.deps.sandbox, entrypoint)
        _record(ctx.deps, "require_and_trace", {"entrypoint": entrypoint}, result)
        return result

    @agent.tool
    async def run_lifecycle_hook(ctx: RunContext[InvestigationDeps], hook_name: str) -> str:
        """Run a lifecycle script (preinstall, postinstall, install, prepare) with instrumentation.
        Only allowed hook names are accepted."""
        result = await _run_lifecycle_hook(ctx.deps.sandbox, hook_name, ctx.deps.lifecycle_hooks)
        _record(ctx.deps, "run_lifecycle_hook", {"hook_name": hook_name}, result)
        return result

    @agent.tool
    async def fast_forward_timers(
        ctx: RunContext[InvestigationDeps], entrypoint: str, advance_ms: int
    ) -> str:
        """Load the package with fake timers, then advance time by advance_ms milliseconds.
        Use this to trigger time-gated payloads (e.g., setTimeout with 48-hour delay).
        The entrypoint should be relative to package root."""
        result = await _fast_forward_timers(ctx.deps.sandbox, entrypoint, advance_ms)
        _record(ctx.deps, "fast_forward_timers", {"entrypoint": entrypoint, "advance_ms": advance_ms}, result)
        return result

    return agent


def build_user_prompt(input_data: dict) -> str:
    """Build the user prompt from investigation input data."""
    parts = [
        f"## Package: {input_data.get('package_name', 'unknown')}@{input_data.get('version', '?')}",
        f"Description: {input_data.get('description', 'N/A')}",
    ]

    flags = input_data.get("flags", [])
    if flags:
        parts.append(f"\n## Inventory Flags\n{json.dumps(flags, indent=2)}")

    static_caps = input_data.get("static_caps", [])
    if static_caps:
        parts.append(f"\n## Capabilities detected by static analysis\n{', '.join(static_caps)}")

    summaries = input_data.get("static_proof_summaries", [])
    if summaries:
        parts.append("\n## Prior findings (from static analysis)")
        for s in summaries:
            parts.append(f"- {s}")

    parts.append(
        "\n## Instructions\n"
        "Investigate this package using the tools available to you. "
        "Start by listing files, then read suspicious files and use sandbox execution to confirm behavior. "
        "Report all findings with evidence."
    )

    return "\n".join(parts)
