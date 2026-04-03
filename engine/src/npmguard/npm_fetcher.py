"""
npm package fetcher — downloads and extracts packages from the npm registry.

Fetches the tarball for a given package@version (defaults to latest),
extracts it into a temporary directory, and returns the path.
The caller is responsible for cleanup (use as a context manager or call cleanup()).
"""

import asyncio
import gzip
import json
import shutil
import tarfile
import tempfile
import urllib.request
from pathlib import Path
from typing import NamedTuple

import structlog

log = structlog.get_logger()

_NPM_REGISTRY = "https://registry.npmjs.org"


class FetchedPackage(NamedTuple):
    name: str
    version: str
    path: Path  # root of extracted package (the "package/" dir inside the tarball)
    tmpdir: str  # underlying tempdir — call cleanup() when done

    def cleanup(self) -> None:
        shutil.rmtree(self.tmpdir, ignore_errors=True)


async def fetch_package(package_name: str, version: str = "latest") -> FetchedPackage:
    """
    Download and extract *package_name* at *version* from the npm registry.

    Returns a FetchedPackage with .path pointing to the extracted directory.
    The caller must call .cleanup() when done (or use a try/finally block).
    """
    resolved_version, tarball_url = await _resolve_tarball_url(package_name, version)
    log.info("fetching_package", package=package_name, version=resolved_version)

    tmpdir = tempfile.mkdtemp(prefix="npmguard-")
    try:
        tgz_path = Path(tmpdir) / "package.tgz"
        await _download(tarball_url, tgz_path)
        package_path = _extract(tgz_path, Path(tmpdir))
        log.info("package_fetched", package=package_name, path=str(package_path))
        return FetchedPackage(
            name=package_name,
            version=resolved_version,
            path=package_path,
            tmpdir=tmpdir,
        )
    except Exception:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise


async def _resolve_tarball_url(package_name: str, version: str) -> tuple[str, str]:
    """Return (resolved_version, tarball_url) for the given package+version."""
    if version == "latest":
        url = f"{_NPM_REGISTRY}/{package_name}/latest"
    else:
        url = f"{_NPM_REGISTRY}/{package_name}/{version}"

    data = await _fetch_json(url)
    resolved = data["version"]
    tarball_url = data["dist"]["tarball"]
    return resolved, tarball_url


async def _fetch_json(url: str) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync_fetch_json, url)


def _sync_fetch_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=30) as resp:  # noqa: S310
        return json.loads(resp.read())


async def _download(url: str, dest: Path) -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _sync_download, url, dest)


def _sync_download(url: str, dest: Path) -> None:
    with urllib.request.urlopen(url, timeout=60) as resp:  # noqa: S310
        dest.write_bytes(resp.read())


def _extract(tgz_path: Path, tmpdir: Path) -> Path:
    """Extract the .tgz and return the path of the 'package' directory inside."""
    extract_dir = tmpdir / "extracted"
    extract_dir.mkdir()

    with gzip.open(tgz_path, "rb") as gz_file:
        with tarfile.open(fileobj=gz_file) as tar:
            # Security: only extract safe members (no absolute paths, no ..)
            safe_members = [
                m for m in tar.getmembers()
                if not m.name.startswith("/") and ".." not in m.name
            ]
            tar.extractall(path=extract_dir, members=safe_members)  # noqa: S202

    # npm tarballs always extract into a "package/" subdirectory
    package_dir = extract_dir / "package"
    if package_dir.is_dir():
        return package_dir

    # Fall back to the first directory if "package/" is missing
    subdirs = [d for d in extract_dir.iterdir() if d.is_dir()]
    if subdirs:
        return subdirs[0]
    return extract_dir
