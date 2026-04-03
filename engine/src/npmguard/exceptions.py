"""
NpmGuard custom exception hierarchy.
"""


class NpmGuardError(Exception):
    """Base exception for the entire NpmGuard application."""

    def __init__(self, message: str, code: str | None = None) -> None:
        self.code = code
        super().__init__(message)


class TemporalConnectionError(NpmGuardError):
    """Failed to connect to the Temporal server."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="TEMPORAL_CONNECTION")


class WorkflowExecutionError(NpmGuardError):
    """A Temporal workflow execution failed."""

    def __init__(self, workflow_id: str, message: str) -> None:
        self.workflow_id = workflow_id
        super().__init__(f"Workflow {workflow_id}: {message}", code="WORKFLOW_EXECUTION")


class AnalysisError(NpmGuardError):
    """An analysis activity encountered an error."""

    def __init__(self, layer: str, message: str) -> None:
        self.layer = layer
        super().__init__(f"{layer}: {message}", code="ANALYSIS_ERROR")
