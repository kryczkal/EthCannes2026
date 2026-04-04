"""NpmGuard Engine worker entry point."""

import asyncio
import sys
from urllib.parse import urlparse

import structlog
from temporalio.client import Client
from temporalio.worker import Worker
from temporalio.worker.workflow_sandbox import SandboxedWorkflowRunner, SandboxRestrictions

from npmguard._logging import configure_logging
from npmguard.activities import (
    analyze_sandbox,
    analyze_static,
    cleanup_package,
    fuzz_adversarial,
    resolve_package,
)
from npmguard.config import Settings
from npmguard.exceptions import TemporalConnectionError
from npmguard.inventory import analyze_inventory
from npmguard.workflows import NpmGuardOrchestrator

log = structlog.get_logger()


async def main() -> None:
    configure_logging()
    settings = Settings()

    log.info("starting_engine", temporal_address=settings.temporal_address)
    llm_log_payload = {
        "backend": settings.llm_backend.value,
        "model": settings.effective_llm_model,
    }
    if settings.effective_llm_base_url is not None:
        llm_log_payload["base_url_host"] = urlparse(settings.effective_llm_base_url).netloc
    if settings.llm_backend.value == "zero_g":
        llm_log_payload["zero_g_network"] = settings.zero_g_network.value
    log.info("llm_backend_configured", **llm_log_payload)

    from temporalio.contrib.pydantic import pydantic_data_converter

    try:
        client = await Client.connect(
            settings.temporal_address, data_converter=pydantic_data_converter
        )
    except Exception as exc:
        raise TemporalConnectionError(
            f"Failed to connect to Temporal at {settings.temporal_address}"
        ) from exc

    log.info("connected_to_temporal", address=settings.temporal_address)

    # pydantic-ai pulls in beartype/httpx/anthropic which break under the Temporal
    # workflow sandbox (circular import in beartype.claw). These only run inside
    # activities (outside the sandbox), so passing them through is safe.
    sandbox_runner = SandboxedWorkflowRunner(
        restrictions=SandboxRestrictions.default.with_passthrough_modules(
            "beartype",
            "pydantic_ai",
            "anthropic",
            "openai",
            "httpx",
            "httpcore",
            "anyio",
            "sniffio",
            "certifi",
            "h11",
            "structlog",
            "npmguard",
        )
    )

    worker = Worker(
        client,
        task_queue=settings.task_queue,
        workflows=[NpmGuardOrchestrator],
        activities=[resolve_package, analyze_inventory, analyze_static, analyze_sandbox, fuzz_adversarial, cleanup_package],
        workflow_runner=sandbox_runner,
    )

    log.info("worker_started", task_queue=settings.task_queue)
    await worker.run()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("worker_stopped_by_user")
    except Exception:
        log.exception("unhandled_error")
        sys.exit(1)
