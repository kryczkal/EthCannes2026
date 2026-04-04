"""File classification: extension, magic bytes, permissions."""

from __future__ import annotations

import os
import stat

from npmguard.config import SKIP_DIRS
from npmguard.inventory.models import FileRecord

EXTENSION_TYPE_MAP: dict[str, str] = {
    ".js": "js",
    ".mjs": "js",
    ".cjs": "js",
    ".json": "json",
    ".md": "doc",
    ".txt": "doc",
    ".html": "web",
    ".css": "web",
    ".ts": "ts",
    ".tsx": "ts",
    ".mts": "ts",
    ".sh": "shell",
    ".map": "sourcemap",
    ".yml": "config",
    ".yaml": "config",
}

MAGIC_BYTES: list[tuple[str, bytes]] = [
    ("ELF", b"\x7fELF"),
    ("MachO", b"\xcf\xfa\xed\xfe"),
    ("MachO", b"\xce\xfa\xed\xfe"),
    ("PE", b"MZ"),
]

ALLOWED_EXTENSIONS = frozenset(
    {
        ".js", ".mjs", ".cjs", ".json", ".md", ".txt", ".ts", ".tsx", ".mts",
        ".css", ".html", ".yml", ".yaml", ".map", ".d.ts", ".sh", ".LICENSE",
    }
)


def _detect_binary(file_path: str) -> tuple[bool, str | None]:
    """Read the first 4 bytes and check against known binary magic bytes."""
    try:
        with open(file_path, "rb") as f:
            header = f.read(4)
    except OSError:
        return False, None

    for name, magic in MAGIC_BYTES:
        if header[: len(magic)] == magic:
            return True, name
    return False, None


def _permissions_octal(mode: int) -> str:
    return oct(stat.S_IMODE(mode))[2:]


def classify_files(package_path: str) -> list[FileRecord]:
    """Walk *package_path* and classify every file."""
    records: list[FileRecord] = []

    for dirpath, dirnames, filenames in os.walk(package_path):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

        for fname in filenames:
            abs_path = os.path.join(dirpath, fname)
            rel_path = os.path.relpath(abs_path, package_path)

            try:
                st = os.stat(abs_path)
            except OSError:
                continue

            _, ext = os.path.splitext(fname)
            is_binary, binary_type = _detect_binary(abs_path)

            file_type = "binary" if is_binary else EXTENSION_TYPE_MAP.get(ext, "unknown")

            records.append(
                FileRecord(
                    path=rel_path,
                    file_type=file_type,
                    size_bytes=st.st_size,
                    permissions=_permissions_octal(st.st_mode),
                    is_binary=is_binary,
                    binary_type=binary_type,
                )
            )

    return records
