"""Sandbox controller — abstract interface + Docker implementation.

The SandboxController ABC provides the extensibility seam for future
kernel-level tracing (strace/eBPF). The DockerSandboxController is
the hackathon-ready implementation using vanilla Docker isolation.
"""

from __future__ import annotations

import asyncio
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass

import structlog

from npmguard.sandbox.sanitize import sanitize_output

log = structlog.get_logger()


@dataclass(frozen=True)
class ExecResult:
    """Result of executing a command inside the sandbox."""

    stdout: str
    stderr: str
    exit_code: int
    timed_out: bool


class SandboxController(ABC):
    """Abstract sandbox that runs untrusted code in isolation.

    Subclass to add observation layers (eBPF, strace, seccomp logging)
    without changing the agent or tool code.
    """

    @abstractmethod
    async def start(self, package_path: str) -> None:
        """Provision an ephemeral sandbox with the package mounted read-only."""

    @abstractmethod
    async def exec(self, cmd: list[str], timeout_s: float = 15.0) -> ExecResult:
        """Run *cmd* inside the sandbox. Hard-kills on timeout."""

    @abstractmethod
    async def stop(self) -> None:
        """Tear down the sandbox and release resources."""

    @abstractmethod
    async def get_trace_log(self) -> list[dict]:
        """Return structured trace events collected during execution.

        Base Docker controller returns []. Future eBPF/strace controllers
        return syscall-level events.
        """

    @property
    @abstractmethod
    def is_running(self) -> bool:
        """Whether the sandbox is currently active."""


class DockerSandboxController(SandboxController):
    """Docker-based sandbox: network=none, cap-drop=ALL, tmpfs, non-root.

    The package tarball is bind-mounted read-only at /pkg inside the container.
    All execution happens via ``docker exec``.
    """

    def __init__(
        self,
        image: str = "node:20-slim",
        memory_limit: str = "256m",
        cpu_quota: float = 0.5,
        network: str = "none",
    ) -> None:
        self._image = image
        self._memory_limit = memory_limit
        self._cpu_quota = cpu_quota
        self._network = network
        self._container_id: str | None = None
        self._container_name: str | None = None

    @property
    def is_running(self) -> bool:
        return self._container_id is not None

    async def start(self, package_path: str) -> None:
        if self._container_id is not None:
            raise RuntimeError("Sandbox already running")

        self._container_name = f"npmguard-sandbox-{uuid.uuid4().hex[:12]}"

        cmd = [
            "docker", "run", "-d",
            "--name", self._container_name,
            f"--network={self._network}",
            "--cap-drop=ALL",
            "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
            "--read-only",
            f"--memory={self._memory_limit}",
            f"--cpus={self._cpu_quota}",
            "--user", "1000:1000",
            "--pids-limit", "64",
            "-v", f"{package_path}:/pkg:ro",
            "-w", "/pkg",
            self._image,
            "sleep", "infinity",
        ]

        log.info("sandbox.starting", name=self._container_name, image=self._image)
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)

        if proc.returncode != 0:
            err = stderr.decode().strip()
            raise RuntimeError(f"Failed to start sandbox container: {err}")

        self._container_id = stdout.decode().strip()[:12]
        log.info("sandbox.started", container=self._container_id)

    async def exec(self, cmd: list[str], timeout_s: float = 15.0) -> ExecResult:
        if self._container_id is None:
            raise RuntimeError("Sandbox not running — call start() first")

        docker_cmd = ["docker", "exec", self._container_name, *cmd]
        timed_out = False

        proc = await asyncio.create_subprocess_exec(
            *docker_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout_raw, stderr_raw = await asyncio.wait_for(
                proc.communicate(), timeout=timeout_s
            )
        except asyncio.TimeoutError:
            timed_out = True
            proc.kill()
            stdout_raw, stderr_raw = b"", b""
            # Also kill the process inside the container
            await self._docker_exec_kill()

        stdout_text, _ = sanitize_output(stdout_raw.decode(errors="replace"))
        stderr_text, _ = sanitize_output(stderr_raw.decode(errors="replace"))

        return ExecResult(
            stdout=stdout_text,
            stderr=stderr_text,
            exit_code=proc.returncode or (-1 if timed_out else 0),
            timed_out=timed_out,
        )

    async def stop(self) -> None:
        if self._container_name is None:
            return

        log.info("sandbox.stopping", container=self._container_id)
        proc = await asyncio.create_subprocess_exec(
            "docker", "rm", "-f", self._container_name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=10)
        self._container_id = None
        self._container_name = None
        log.info("sandbox.stopped")

    async def get_trace_log(self) -> list[dict]:
        """No kernel tracing in base Docker controller."""
        return []

    async def _docker_exec_kill(self) -> None:
        """Best-effort kill of all user processes inside the container."""
        if self._container_name is None:
            return
        proc = await asyncio.create_subprocess_exec(
            "docker", "exec", self._container_name,
            "kill", "-9", "-1",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            await asyncio.wait_for(proc.wait(), timeout=5)
        except asyncio.TimeoutError:
            pass
