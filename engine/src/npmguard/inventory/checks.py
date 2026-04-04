"""Phase 0 dealbreaker + flag checks."""

from __future__ import annotations

import os
import re

from npmguard.inventory.classify import ALLOWED_EXTENSIONS
from npmguard.inventory.models import DealBreaker, EntryPoints, FileRecord, InventoryFlag, Severity
from npmguard.inventory.parse_manifest import LIFECYCLE_SCRIPTS

SHELL_PIPE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"curl\s.*\|\s*sh\b", re.IGNORECASE),
    re.compile(r"curl\s.*\|\s*bash\b", re.IGNORECASE),
    re.compile(r"wget\s.*\|\s*sh\b", re.IGNORECASE),
    re.compile(r"wget\s.*\|\s*bash\b", re.IGNORECASE),
    re.compile(r"curl\s.*\|"),
    re.compile(r"wget\s.*-O.*&&\s*(?:sh|bash|chmod)"),
]

ENCODED_CONTENT_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"[0-9a-f]{64,}", re.IGNORECASE),
    re.compile(r"[A-Za-z0-9+/]{64,}={0,2}"),
]

STANDARD_DOTFILES = frozenset(
    {".npmignore", ".gitignore", ".browserslistrc", ".editorconfig"}
)
STANDARD_DOTFILE_PREFIXES = (".eslintrc", ".prettierrc", ".babelrc")

_JS_EXTENSIONS = frozenset((".js", ".mjs", ".cjs"))

_MINIFIED_LINE_THRESHOLD = 500


def _check_shell_pipe(
    scripts: dict[str, str],
) -> DealBreaker | None:
    for key, value in scripts.items():
        for pattern in SHELL_PIPE_PATTERNS:
            if pattern.search(value):
                return DealBreaker(
                    check="shell-pipe",
                    detail=f"Script '{key}' contains shell pipe: {value}",
                )
    return None


def _check_missing_install_file(
    entry_points: EntryPoints,
    files: list[FileRecord],
) -> DealBreaker | None:
    file_paths = {f.path for f in files}
    for ref in entry_points.install:
        if ref not in file_paths:
            return DealBreaker(
                check="missing-install-script",
                detail=f"Install script references '{ref}' but file not found in package",
            )
    return None


def _flag_lifecycle_scripts(scripts: dict[str, str]) -> list[InventoryFlag]:
    hooks = [k for k in scripts if k in LIFECYCLE_SCRIPTS]
    if not hooks:
        return []
    return [
        InventoryFlag(
            severity=Severity.INFO,
            check="lifecycle-scripts",
            detail=f"Package declares lifecycle hooks: {', '.join(hooks)}",
        )
    ]


def _flag_non_node_scripts(scripts: dict[str, str]) -> list[InventoryFlag]:
    flags: list[InventoryFlag] = []
    for key in LIFECYCLE_SCRIPTS:
        value = scripts.get(key)
        if value is None:
            continue
        parts = value.strip().split()
        if not parts or parts[0] != "node":
            flags.append(
                InventoryFlag(
                    severity=Severity.WARN,
                    check="non-node-script",
                    detail=f"Lifecycle script '{key}' is not a node command: {value}",
                )
            )
    return flags


def _flag_binary_files(files: list[FileRecord]) -> list[InventoryFlag]:
    flags: list[InventoryFlag] = []
    for f in files:
        if f.is_binary:
            flags.append(
                InventoryFlag(
                    severity=Severity.WARN,
                    check="binary-detected",
                    detail=f"Binary file detected ({f.binary_type})",
                    file=f.path,
                )
            )
    return flags


def _flag_executable_outside_bin(files: list[FileRecord]) -> list[InventoryFlag]:
    flags: list[InventoryFlag] = []
    for f in files:
        if f.path.startswith("bin/") or f.path.startswith("bin\\"):
            continue
        mode = int(f.permissions, 8)
        if mode & 0o111:
            flags.append(
                InventoryFlag(
                    severity=Severity.WARN,
                    check="executable-outside-bin",
                    detail=f"File has executable permissions ({f.permissions}) outside bin/",
                    file=f.path,
                )
            )
    return flags


def _flag_unusual_extensions(files: list[FileRecord]) -> list[InventoryFlag]:
    flags: list[InventoryFlag] = []
    for f in files:
        _, ext = os.path.splitext(f.path)
        if not ext:
            continue
        if ext not in ALLOWED_EXTENSIONS:
            flags.append(
                InventoryFlag(
                    severity=Severity.WARN,
                    check="unusual-extension",
                    detail=f"Unusual file extension: {ext}",
                    file=f.path,
                )
            )
    return flags


def _flag_encoded_content(
    files: list[FileRecord], package_path: str
) -> list[InventoryFlag]:
    flags: list[InventoryFlag] = []
    for f in files:
        _, ext = os.path.splitext(f.path)
        if ext in _JS_EXTENSIONS or f.is_binary or f.size_bytes == 0:
            continue
        abs_path = os.path.join(package_path, f.path)
        try:
            with open(abs_path, encoding="utf-8", errors="ignore") as fh:
                content = fh.read()
        except OSError:
            continue
        for pattern in ENCODED_CONTENT_PATTERNS:
            if pattern.search(content):
                flags.append(
                    InventoryFlag(
                        severity=Severity.WARN,
                        check="encoded-content",
                        detail=f"File contains long encoded data ({pattern.pattern[:30]}...)",
                        file=f.path,
                    )
                )
                break  # one flag per file
    return flags


def _flag_minified_install_script(
    entry_points: EntryPoints, package_path: str
) -> list[InventoryFlag]:
    flags: list[InventoryFlag] = []
    for ref in entry_points.install:
        abs_path = os.path.join(package_path, ref)
        try:
            with open(abs_path, encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    if len(line) > _MINIFIED_LINE_THRESHOLD:
                        flags.append(
                            InventoryFlag(
                                severity=Severity.WARN,
                                check="minified-install-script",
                                detail=f"Install script has line > {_MINIFIED_LINE_THRESHOLD} chars",
                                file=ref,
                            )
                        )
                        break
        except OSError:
            continue
    return flags


def _flag_hidden_dotfiles(files: list[FileRecord]) -> list[InventoryFlag]:
    flags: list[InventoryFlag] = []
    for f in files:
        basename = os.path.basename(f.path)
        if not basename.startswith("."):
            continue
        if basename in STANDARD_DOTFILES:
            continue
        if any(basename.startswith(prefix) for prefix in STANDARD_DOTFILE_PREFIXES):
            continue
        flags.append(
            InventoryFlag(
                severity=Severity.INFO,
                check="hidden-dotfile",
                detail=f"Non-standard dotfile: {basename}",
                file=f.path,
            )
        )
    return flags


def run_inventory_checks(
    scripts: dict[str, str],
    entry_points: EntryPoints,
    files: list[FileRecord],
    package_path: str,
) -> tuple[list[InventoryFlag], DealBreaker | None]:
    """Run all Phase 0 checks. Returns (flags, dealbreaker)."""
    # Dealbreakers first — return immediately if found
    dealbreaker = _check_shell_pipe(scripts)
    if dealbreaker:
        return [], dealbreaker

    dealbreaker = _check_missing_install_file(entry_points, files)
    if dealbreaker:
        return [], dealbreaker

    # Accumulate flags
    flags: list[InventoryFlag] = []
    flags.extend(_flag_lifecycle_scripts(scripts))
    flags.extend(_flag_non_node_scripts(scripts))
    flags.extend(_flag_binary_files(files))
    flags.extend(_flag_executable_outside_bin(files))
    flags.extend(_flag_unusual_extensions(files))
    flags.extend(_flag_encoded_content(files, package_path))
    flags.extend(_flag_minified_install_script(entry_points, package_path))
    flags.extend(_flag_hidden_dotfiles(files))

    return flags, None
