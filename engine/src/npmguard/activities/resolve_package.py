"""
Resolve a package name to an extracted directory on disk.

For test-pkg-* packages: points to the pre-built fixture in sandbox/test-fixtures/.
For real npm packages: fetches from the registry and extracts into a temp directory.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import structlog
from temporalio import activity

from npmguard.exceptions import AnalysisError
from npmguard.models import ResolvedPackage
from npmguard.npm_fetcher import fetch_package

log = structlog.get_logger()

_REPO_ROOT = Path(__file__).parent.parent.parent.parent.parent
_TEST_FIXTURES_DIR = _REPO_ROOT / "sandbox" / "test-fixtures"


@activity.defn
async def resolve_package(package_name: str) -> ResolvedPackage:
    """Resolve *package_name* to an extracted directory path.

    Test packages (``test-pkg-*``) are resolved to their fixture directory.
    Real packages are fetched from the npm registry and extracted to a temp dir.
    """
    if package_name.startswith("test-pkg-"):
        fixture_dir = _TEST_FIXTURES_DIR / package_name
        if not fixture_dir.is_dir():
            raise AnalysisError(
                "resolve_package",
                f"Test fixture not found: {fixture_dir}",
            )
        log.info("resolved_test_fixture", package=package_name, path=str(fixture_dir))
        return ResolvedPackage(path=str(fixture_dir), needs_cleanup=False, tmpdir=None)

    # Real npm package — fetch and extract
    fetched = await fetch_package(package_name)
    log.info(
        "resolved_npm_package",
        package=package_name,
        version=fetched.version,
        path=str(fetched.path),
    )
    return ResolvedPackage(
        path=str(fetched.path),
        needs_cleanup=True,
        tmpdir=fetched.tmpdir,
    )


@activity.defn
async def cleanup_package(tmpdir: str) -> None:
    """Remove a temporary directory created by resolve_package."""
    log.info("cleanup_package", tmpdir=tmpdir)
    shutil.rmtree(tmpdir, ignore_errors=True)
