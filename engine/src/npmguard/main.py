"""NpmGuard Engine worker entry point."""

import asyncio
import sys

import structlog
from temporalio.client import Client
from temporalio.worker import Worker

from npmguard.activities import (
    analyze_sandbox,
    analyze_static,
    cleanup_package,
    fuzz_adversarial,
    resolve_package,
)
from npmguard.config import Settings
from npmguard.exceptions import TemporalConnectionError
from npmguard._logging import configure_logging
from npmguard.workflows import NpmGuardOrchestrator

log = structlog.get_logger()


async def main() -> None:
    configure_logging()
    settings = Settings()

    log.info("starting_engine", temporal_address=settings.temporal_address)

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

    worker = Worker(
        client,
        task_queue=settings.task_queue,
        workflows=[NpmGuardOrchestrator],
        activities=[resolve_package, analyze_static, analyze_sandbox, fuzz_adversarial, cleanup_package],
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
