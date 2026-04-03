import uvicorn
from contextlib import asynccontextmanager
from typing import Optional
import uuid

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from temporalio.client import Client

from npmguard.models import AuditReport
from npmguard.workflows.orchestrator import NpmGuardOrchestrator

# Global Temporal client instance
temporal_client: Optional[Client] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Connect to Temporal on startup
    global temporal_client
    from temporalio.contrib.pydantic import pydantic_data_converter

    try:
        temporal_client = await Client.connect(
            "localhost:7233", data_converter=pydantic_data_converter
        )
        print("Connected to Temporal Server.")
    except Exception as e:
        print(f"Failed to connect to Temporal: {e}")
    yield
    # Cleanup on shutdown
    print("Shutting down API...")


app = FastAPI(
    title="NpmGuard API",
    description="API for triggering NpmGuard security scans",
    version="0.1.0",
    lifespan=lifespan,
)


class AuditRequest(BaseModel):
    package_name: str


@app.post("/audit", response_model=AuditReport)
async def trigger_audit(request: AuditRequest) -> AuditReport:
    """
    Triggers the NpmGuard security analysis pipeline for a given package name.
    """
    if not temporal_client:
        raise HTTPException(status_code=500, detail="Temporal client not connected")

    try:
        # TODO: Return worker id?
        result = await temporal_client.execute_workflow(
            NpmGuardOrchestrator.run,
            request.package_name,
            id=f"npmguard-{request.package_name}-{uuid.uuid4().hex[:8]}",
            task_queue="npmguard-task-queue",
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Workflow execution failed: {str(e)}")


if __name__ == "__main__":
    uvicorn.run("npmguard.api:app", host="0.0.0.0", port=8000, reload=True)
