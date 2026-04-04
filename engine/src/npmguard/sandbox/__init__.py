"""Sandbox subsystem — isolated execution of untrusted npm packages."""

from __future__ import annotations

from typing import TYPE_CHECKING

from npmguard.sandbox.controller import (
    DockerSandboxController,
    ExecResult,
    SandboxController,
)

if TYPE_CHECKING:
    from npmguard.config import Settings

__all__ = [
    "DockerSandboxController",
    "ExecResult",
    "SandboxController",
    "make_sandbox",
]


def make_sandbox(settings: Settings) -> SandboxController:
    """Factory — select sandbox backend from config.

    Currently only ``docker`` is supported. Future backends (``ebpf``)
    will be added here.
    """
    if settings.sandbox_backend == "docker":
        return DockerSandboxController(
            image=settings.sandbox_image,
            memory_limit=f"{settings.sandbox_memory_mb}m",
            cpu_quota=settings.sandbox_cpus,
            network=settings.sandbox_network,
        )
    raise ValueError(f"Unknown sandbox backend: {settings.sandbox_backend!r}")
