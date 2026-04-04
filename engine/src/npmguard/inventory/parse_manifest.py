"""Parse package.json into structured inventory data."""

from __future__ import annotations

from typing import Any

from npmguard.inventory.models import EntryPoints, PackageMetadata

LIFECYCLE_SCRIPTS = frozenset(("preinstall", "install", "postinstall", "prepare", "prepublish"))


def extract_script_file_ref(script_value: str) -> str | None:
    """Extract the JS file path from a script like ``"node [flags] <file>"``."""
    parts = script_value.strip().split()
    if not parts or parts[0] != "node":
        return None
    for part in parts[1:]:
        if not part.startswith("-"):
            return part
    return None


def _extract_exports_entries(exports: Any) -> list[str]:
    """Recursively extract file paths from an ``exports`` field."""
    if isinstance(exports, str):
        return [exports]
    if isinstance(exports, dict):
        entries: list[str] = []
        for value in exports.values():
            entries.extend(_extract_exports_entries(value))
        return entries
    return []


def _extract_bin_entries(bin_field: Any) -> list[str]:
    if isinstance(bin_field, str):
        return [bin_field]
    if isinstance(bin_field, dict):
        return [v for v in bin_field.values() if isinstance(v, str)]
    return []


def parse_package_json(
    pkg: dict[str, Any],
) -> tuple[PackageMetadata, dict[str, str], EntryPoints, dict[str, dict[str, str]]]:
    """Parse a package.json dict into structured inventory components.

    Returns (metadata, scripts, entry_points, dependencies).
    """
    metadata = PackageMetadata(
        name=pkg.get("name"),
        version=pkg.get("version"),
        description=pkg.get("description"),
        license=pkg.get("license"),
        homepage=pkg.get("homepage"),
        repository=pkg.get("repository"),
    )

    scripts: dict[str, str] = pkg.get("scripts", {})

    install_entries: list[str] = []
    for hook in LIFECYCLE_SCRIPTS:
        if hook in scripts:
            ref = extract_script_file_ref(scripts[hook])
            if ref is not None:
                install_entries.append(ref)

    runtime_entries: list[str] = [pkg.get("main", "index.js")]
    if pkg.get("module"):
        runtime_entries.append(pkg["module"])
    runtime_entries.extend(_extract_exports_entries(pkg.get("exports")))
    runtime_entries = list(dict.fromkeys(runtime_entries))  # dedup, preserve order

    entry_points = EntryPoints(
        install=install_entries,
        runtime=runtime_entries,
        bin=_extract_bin_entries(pkg.get("bin")),
    )

    dependencies = {
        "prod": pkg.get("dependencies", {}),
        "dev": pkg.get("devDependencies", {}),
        "optional": pkg.get("optionalDependencies", {}),
        "peer": pkg.get("peerDependencies", {}),
    }

    return metadata, scripts, entry_points, dependencies
