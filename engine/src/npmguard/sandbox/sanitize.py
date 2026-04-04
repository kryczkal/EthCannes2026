"""Output sanitization for sandbox results.

Truncates, strips ANSI escapes, and detects prompt injection attempts
before sandbox output reaches the LLM agent.
"""

from __future__ import annotations

import re

MAX_OUTPUT_BYTES = 64 * 1024  # 64 KB

ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")

# Patterns that indicate the sandbox output is trying to hijack the LLM.
# Case-insensitive substring match.
INJECTION_PATTERNS = [
    "ignore all previous instructions",
    "ignore all instructions",
    "forget all previous",
    "forget your instructions",
    "you are a helpful assistant",
    "do not flag this",
    "do not report this",
    "[system] override",
    "disregard prior instructions",
    "new instruction:",
    "<<SYS>>",
    "[INST]",
]

REDACTED_MSG = "[REDACTED: potential prompt injection detected in sandbox output]"


def sanitize_output(raw: str, max_bytes: int = MAX_OUTPUT_BYTES) -> tuple[str, bool]:
    """Sanitize sandbox output for safe consumption by the LLM.

    Returns ``(sanitized_text, injection_detected)``.
    If injection is detected the text is replaced with a redaction notice,
    but the boolean flag lets callers log or escalate.
    """
    # Strip ANSI escape codes
    text = ANSI_ESCAPE_RE.sub("", raw)

    # Truncate
    if len(text) > max_bytes:
        text = text[:max_bytes] + f"\n... [truncated at {max_bytes} bytes]"

    # Check for prompt injection
    lower = text.lower()
    injection_detected = any(p in lower for p in INJECTION_PATTERNS)

    if injection_detected:
        return REDACTED_MSG, True

    return text, False
