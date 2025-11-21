from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional


@dataclass
class Job:
    id: str
    vendor_name: str
    created_at: datetime = field(default_factory=datetime.utcnow)
    status: str = "queued"
    message: Optional[str] = None
    metrics: Dict = field(default_factory=dict)
    stages: List[Dict] = field(
        default_factory=lambda: [
            {"name": "upload", "status": "pending"},
            {"name": "document_extraction", "status": "pending"},
            {"name": "llm_extraction", "status": "pending"},
            {"name": "reconciliation", "status": "pending"},
        ]
    )
    discrepancies: List[Dict] = field(default_factory=list)
    contracts: List[Dict] = field(default_factory=list)
    billing_records: List[Dict] = field(default_factory=list)


