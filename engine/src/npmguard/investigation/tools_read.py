"""Host-side read tools for the investigation agent.

These operate directly on the extracted package tarball on the host filesystem.
No Docker needed. All paths are validated to stay within the package directory.
"""

from __future__ import annotations

import json
import os
import re

import structlog

log = structlog.get_logger()

MAX_FILE_READ = 100_000  # 100 KB
MAX_SEARCH_RESULTS = 50
CONTEXT_LINES = 3


def _safe_path(package_path: str, rel_path: str) -> str | None:
    """Resolve *rel_path* within *package_path*, rejecting traversal attempts."""
    abs_path = os.path.normpath(os.path.join(package_path, rel_path))
    if not abs_path.startswith(os.path.normpath(package_path) + os.sep) and abs_path != os.path.normpath(package_path):
        return None
    return abs_path


def read_file(package_path: str, path: str) -> str:
    """Read a file from the package. Returns content or an error string."""
    abs_path = _safe_path(package_path, path)
    if abs_path is None:
        return f"ERROR: path traversal blocked: {path!r}"

    if not os.path.isfile(abs_path):
        return f"ERROR: file not found: {path!r}"

    try:
        size = os.path.getsize(abs_path)
        if size > MAX_FILE_READ:
            return f"ERROR: file too large ({size} bytes, max {MAX_FILE_READ})"
        with open(abs_path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError as exc:
        return f"ERROR: {exc}"


def list_files(package_path: str) -> str:
    """List all files in the package with sizes and extensions. Returns JSON."""
    entries = []
    skip = {"node_modules", ".git", ".svn"}

    for dirpath, dirnames, filenames in os.walk(package_path):
        dirnames[:] = [d for d in dirnames if d not in skip]
        for fname in filenames:
            abs_path = os.path.join(dirpath, fname)
            rel_path = os.path.relpath(abs_path, package_path)
            try:
                size = os.path.getsize(abs_path)
            except OSError:
                size = -1
            _, ext = os.path.splitext(fname)
            entries.append({"path": rel_path, "size": size, "ext": ext or None})

    return json.dumps(entries, indent=2)


def search_files(package_path: str, pattern: str) -> str:
    """Regex search across all text files. Returns matches with context lines."""
    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error as exc:
        return f"ERROR: invalid regex: {exc}"

    skip = {"node_modules", ".git", ".svn"}
    text_exts = {".js", ".mjs", ".cjs", ".ts", ".mts", ".json", ".md", ".txt", ".yml", ".yaml"}
    results: list[str] = []

    for dirpath, dirnames, filenames in os.walk(package_path):
        dirnames[:] = [d for d in dirnames if d not in skip]
        for fname in filenames:
            _, ext = os.path.splitext(fname)
            if ext not in text_exts:
                continue

            abs_path = os.path.join(dirpath, fname)
            rel_path = os.path.relpath(abs_path, package_path)

            try:
                with open(abs_path, encoding="utf-8", errors="replace") as f:
                    lines = f.readlines()
            except OSError:
                continue

            for i, line in enumerate(lines):
                if regex.search(line):
                    start = max(0, i - CONTEXT_LINES)
                    end = min(len(lines), i + CONTEXT_LINES + 1)
                    snippet = "".join(
                        f"  {'>' if j == i else ' '} {j + 1}: {lines[j]}"
                        for j in range(start, end)
                    )
                    results.append(f"[{rel_path}:{i + 1}]\n{snippet}")

                    if len(results) >= MAX_SEARCH_RESULTS:
                        results.append(f"... truncated at {MAX_SEARCH_RESULTS} results")
                        return "\n".join(results)

    if not results:
        return f"No matches for pattern: {pattern!r}"
    return "\n".join(results)
