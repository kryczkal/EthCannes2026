"""NpmGuard API — FastAPI endpoint for triggering security scans."""

import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import structlog
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from temporalio.client import Client

from npmguard._logging import configure_logging
from npmguard.config import Settings
from npmguard.exceptions import TemporalConnectionError
from npmguard.models import AuditReport
from npmguard.workflows.orchestrator import NpmGuardOrchestrator

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Connect to Temporal on startup, cleanup on shutdown."""
    settings = Settings()

    from temporalio.contrib.pydantic import pydantic_data_converter

    app.state.settings = settings
    try:
        app.state.temporal_client = await Client.connect(
            settings.temporal_address, data_converter=pydantic_data_converter
        )
        log.info("connected_to_temporal", address=settings.temporal_address)
    except Exception as exc:
        raise TemporalConnectionError(
            f"Failed to connect to Temporal at {settings.temporal_address}"
        ) from exc

    yield

    log.info("shutting_down_api")


app = FastAPI(
    title="NpmGuard API",
    description="API for triggering NpmGuard security scans",
    version="0.1.0",
    lifespan=lifespan,
)


class AuditRequest(BaseModel):
    package_name: str


@app.post("/audit", response_model=AuditReport)
async def trigger_audit(request: AuditRequest, http_request: Request) -> AuditReport:
    """Trigger the NpmGuard security analysis pipeline for a given package name."""
    temporal_client: Client | None = getattr(http_request.app.state, "temporal_client", None)
    if not temporal_client:
        raise HTTPException(status_code=503, detail="Temporal client not connected")

    settings: Settings = http_request.app.state.settings
    workflow_id = f"npmguard-{request.package_name}-{uuid.uuid4().hex[:8]}"

    log.info("triggering_audit", package=request.package_name, workflow_id=workflow_id)

    return await temporal_client.execute_workflow(
        NpmGuardOrchestrator.run,
        request.package_name,
        id=workflow_id,
        task_queue=settings.task_queue,
    )


if __name__ == "__main__":
    configure_logging()
    settings = Settings()
    uvicorn.run(
        "npmguard.api:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True,
    )
