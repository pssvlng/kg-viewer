"""
Domain models for upload job management.
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Dict, Any
from enum import Enum


class JobStatus(Enum):
    """Enumeration for job status."""
    PROCESSING = "processing"
    FAILED = "failed"
    SUCCESS = "success"


@dataclass
class UploadJob:
    """Domain model for upload jobs."""
    
    job_id: str
    filename: str
    graph_name: str
    timestamp: datetime
    status: JobStatus
    progress: float
    total_triples: int
    processed_triples: int
    current_batch: int
    total_batches: int
    error_message: Optional[str] = None
    result_data: Optional[Dict[str, Any]] = None

    def update_progress(self, current_batch: int, processed_triples: int) -> None:
        """Update job progress with validation."""
        if processed_triples < 0:
            raise ValueError("Processed triples cannot be negative")
        if current_batch < 0:
            raise ValueError("Current batch cannot be negative")
        
        self.current_batch = current_batch
        self.processed_triples = min(processed_triples, self.total_triples)
        self.progress = (self.processed_triples / self.total_triples) * 100.0 if self.total_triples > 0 else 0.0

    def mark_completed(self, result_data: Dict[str, Any]) -> None:
        """Mark job as successfully completed."""
        self.status = JobStatus.SUCCESS
        self.progress = 100.0
        self.result_data = result_data
        self.error_message = None

    def mark_failed(self, error_message: str) -> None:
        """Mark job as failed."""
        self.status = JobStatus.FAILED
        self.error_message = error_message

    def is_complete(self) -> bool:
        """Check if job is complete (success or failed)."""
        return self.status in [JobStatus.SUCCESS, JobStatus.FAILED]

    def to_dict(self) -> Dict[str, Any]:
        """Convert job to dictionary for serialization."""
        return {
            'job_id': self.job_id,
            'filename': self.filename,
            'graph_name': self.graph_name,
            'timestamp': self.timestamp.isoformat(),
            'status': self.status.value,
            'progress': self.progress,
            'total_triples': self.total_triples,
            'processed_triples': self.processed_triples,
            'current_batch': self.current_batch,
            'total_batches': self.total_batches,
            'error_message': self.error_message,
            'result_data': self.result_data
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'UploadJob':
        """Create job from dictionary."""
        timestamp = data['timestamp']
        if isinstance(timestamp, str):
            timestamp = datetime.fromisoformat(timestamp)
        
        status = data['status']
        if isinstance(status, str):
            status = JobStatus(status)
        
        return cls(
            job_id=data['job_id'],
            filename=data['filename'],
            graph_name=data['graph_name'],
            timestamp=timestamp,
            status=status,
            progress=data['progress'],
            total_triples=data['total_triples'],
            processed_triples=data['processed_triples'],
            current_batch=data['current_batch'],
            total_batches=data['total_batches'],
            error_message=data.get('error_message'),
            result_data=data.get('result_data')
        )