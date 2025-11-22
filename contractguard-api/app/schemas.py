from datetime import datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    job_id: str
    message: str = "Upload accepted. Processing has started."


class JobStage(BaseModel):
    name: str
    status: Literal["pending", "in_progress", "completed", "failed"]
    detail: Optional[str] = None
    completed_at: Optional[datetime] = None


class JobStatus(BaseModel):
    job_id: str
    created_at: datetime
    status: Literal["queued", "in_progress", "completed", "failed"]
    message: Optional[str] = None
    stages: List[JobStage]
    metrics: dict = Field(default_factory=dict)


class AnalysisSummary(BaseModel):
    job: JobStatus
    discrepancies: List[dict]


class ChatRequest(BaseModel):
    question: str


class ChatResponse(BaseModel):
    answer: str
    context_summary: Optional[str] = None
    sources: Optional[List[dict]] = None


