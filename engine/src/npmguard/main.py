import asyncio
import logging
from temporalio.client import Client
from temporalio.worker import Worker

from npmguard.activities import analyze_static, analyze_sandbox, fuzz_adversarial
from npmguard.workflows import NpmGuardOrchestrator


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    logging.info("Starting NpmGuard Engine Skeleton")

    # Connect to local Temporal server (update the URL as needed)
    client = await Client.connect("localhost:7233")
    logging.info("Connected to Temporal Server")

    # Run the worker to process workflows and activities
    worker = Worker(
        client,
        task_queue="npmguard-task-queue",
        workflows=[NpmGuardOrchestrator],
        activities=[analyze_static, analyze_sandbox, fuzz_adversarial],
    )

    logging.info("Worker started, waiting for tasks...")
    await worker.run()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Worker stopped by user")
