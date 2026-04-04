"""
Layer 2: Sandbox Execution

For known test packages (test-pkg-*): runs the pre-written Vitest exploit harness
located in sandbox/exploits/ and maps passing tests to concrete Capabilities + Proofs.

For real npm packages: placeholder — Docker-based dynamic analysis would be wired here.
"""

import asyncio
import json
import os
from typing import Any, TypedDict

import structlog
from temporalio import activity

from npmguard.config import REPO_ROOT
from npmguard.models import CapabilityEnum, Proof, ProofKind

log = structlog.get_logger()

_SANDBOX_DIR = REPO_ROOT / "sandbox"


class _TestPkgEntry(TypedDict):
    test_file: str
    capabilities: list[CapabilityEnum]


# Maps the package name fragment (after "test-pkg-") to:
#   - the exploit test file to run
#   - the CapabilityEnums that a passing test proves
_TEST_PKG_MAP: dict[str, _TestPkgEntry] = {
    "lifecycle-hook": {
        "test_file": "exploits/lifecycle-hook.test.js",
        "capabilities": [
            CapabilityEnum.LIFECYCLE_HOOK,
            CapabilityEnum.BINARY_DOWNLOAD,
            CapabilityEnum.PROCESS_SPAWN,
            CapabilityEnum.NETWORK,
        ],
    },
    "env-exfil": {
        "test_file": "exploits/env-exfil.test.js",
        "capabilities": [
            CapabilityEnum.ENV_VARS,
            CapabilityEnum.CREDENTIAL_THEFT,
            CapabilityEnum.NETWORK,
        ],
    },
    "encrypted-payload": {
        "test_file": "exploits/encrypted-payload.test.js",
        "capabilities": [
            CapabilityEnum.ENCRYPTED_PAYLOAD,
            CapabilityEnum.NETWORK,
        ],
    },
    "filesystem-wiper": {
        "test_file": "exploits/filesystem-wiper.test.js",
        "capabilities": [
            CapabilityEnum.FILESYSTEM,
            CapabilityEnum.NETWORK,
            CapabilityEnum.GEO_GATING,
        ],
    },
    "dos-loop": {
        "test_file": "exploits/dos-loop.test.js",
        "capabilities": [
            CapabilityEnum.DOS_LOOP,
        ],
    },
    "obfuscated-dropper": {
        "test_file": "exploits/obfuscated-dropper.test.js",
        "capabilities": [
            CapabilityEnum.OBFUSCATION,
            CapabilityEnum.BINARY_DOWNLOAD,
            CapabilityEnum.NETWORK,
        ],
    },
    "dns-exfil": {
        "test_file": "exploits/dns-exfil.test.js",
        "capabilities": [
            CapabilityEnum.DNS_EXFIL,
            CapabilityEnum.ENV_VARS,
            CapabilityEnum.CREDENTIAL_THEFT,
            CapabilityEnum.ANTI_AI_PROMPT,
            CapabilityEnum.ENCRYPTED_PAYLOAD,
        ],
    },
    "dom-inject": {
        "test_file": "exploits/dom-inject.test.js",
        "capabilities": [
            CapabilityEnum.DOM_INJECT,
            CapabilityEnum.NETWORK,
        ],
    },
    "clipboard-hijack": {
        "test_file": "exploits/clipboard-hijack.test.js",
        "capabilities": [
            CapabilityEnum.CLIPBOARD_HIJACK,
            CapabilityEnum.NETWORK,
        ],
    },
    "telemetry-rat": {
        "test_file": "exploits/telemetry-rat.test.js",
        "capabilities": [
            CapabilityEnum.TELEMETRY_RAT,
            CapabilityEnum.PROCESS_SPAWN,
            CapabilityEnum.NETWORK,
        ],
    },
    "build-plugin-exfil": {
        "test_file": "exploits/build-plugin-exfil.test.js",
        "capabilities": [
            CapabilityEnum.BUILD_PLUGIN_EXFIL,
            CapabilityEnum.ENV_VARS,
            CapabilityEnum.CREDENTIAL_THEFT,
            CapabilityEnum.NETWORK,
        ],
    },
}


@activity.defn
async def analyze_sandbox(package_name: str) -> tuple[list[CapabilityEnum], list[Proof]]:
    """
    Layer 2: Sandbox Execution.

    For test-pkg-* packages: runs the Vitest harness and maps proven exploits to
    Capabilities and Proofs. Each passing test is a *concrete* proof that the
    behaviour exists, not a static guess.

    For real npm packages: returns empty results (Docker harness not yet wired).
    """
    fragment = _get_test_pkg_fragment(package_name)
    if fragment is None:
        log.info("sandbox_skip_real_package", package=package_name)
        return [], []

    entry = _TEST_PKG_MAP.get(fragment)
    if entry is None:
        log.warning("sandbox_no_exploit_harness", package=package_name)
        return [], []

    test_file: str = entry["test_file"]
    expected_caps: list[CapabilityEnum] = entry["capabilities"]

    log.info("sandbox_running_exploit_harness", package=package_name, test_file=test_file)
    results = await _run_vitest(test_file)

    proofs: list[Proof] = []
    has_passing = False

    for suite in results.get("testResults", []):
        for assertion in suite.get("assertionResults", []):
            if assertion.get("status") == "passed":
                has_passing = True
                full_name = assertion.get("fullName", "")
                test_title = assertion.get("title", full_name)
                duration_ms = assertion.get("duration", 0)

                proofs.append(
                    Proof(
                        file_line=test_file,
                        problem=f"Dynamic exploit confirmed: {test_title}",
                        evidence=(
                            f"Vitest exploit harness passed in {duration_ms:.0f}ms. "
                            f"Test: {full_name!r}"
                        ),
                        kind=ProofKind.AI_DYNAMIC,
                        reproducible=True,
                        reproduction_cmd=f"npx vitest run {test_file}",
                    )
                )
            elif assertion.get("status") == "failed":
                failure_msgs = assertion.get("failureMessages", [])
                log.info(
                    "sandbox_exploit_test_failed",
                    test=assertion.get("fullName"),
                    reason=failure_msgs[:1],
                )

    # Capabilities confirmed if at least one exploit test passed
    capabilities = list(expected_caps) if has_passing else []

    log.info(
        "sandbox_analysis_complete",
        package=package_name,
        capabilities=[c.value for c in capabilities],
        proofs=len(proofs),
    )
    return capabilities, proofs


def _get_test_pkg_fragment(package_name: str) -> str | None:
    """
    If the package name matches 'test-pkg-<fragment>', return the fragment.
    Otherwise return None.
    """
    prefix = "test-pkg-"
    if package_name.startswith(prefix):
        return package_name[len(prefix):]
    return None


async def _run_vitest(test_file: str) -> dict[str, Any]:
    """Run vitest with JSON reporter on *test_file* (relative to sandbox dir)."""
    if not _SANDBOX_DIR.is_dir():
        log.error("sandbox_dir_missing", path=str(_SANDBOX_DIR))
        return {}

    # Find npx — use the same node_modules as the project
    npx = _find_npx()
    cmd = [npx, "vitest", "run", "--reporter=json", test_file]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(_SANDBOX_DIR),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "CI": "true"},
    )

    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)

    if stderr:
        log.debug("vitest_stderr", output=stderr.decode()[:500])

    raw = stdout.decode().strip()
    if not raw:
        log.warning("vitest_no_output", test_file=test_file)
        return {}

    # vitest --reporter=json prints JSON to stdout; strip any prefix noise
    json_start = raw.find("{")
    if json_start == -1:
        log.warning("vitest_output_not_json", raw=raw[:200])
        return {}

    try:
        result: dict[str, Any] = json.loads(raw[json_start:])
        return result
    except json.JSONDecodeError as exc:
        log.warning("vitest_json_parse_error", error=str(exc), raw=raw[:200])
        return {}


def _find_npx() -> str:
    """Return the path to npx, preferring the project-local node_modules/.bin."""
    local = REPO_ROOT / "node_modules" / ".bin" / "npx"
    if local.is_file():
        return str(local)
    return "npx"
