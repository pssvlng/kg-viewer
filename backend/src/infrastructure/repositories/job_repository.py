"""
Repository interfaces and implementations for job management.
"""
from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any
import json
import os
import threading
from datetime import datetime
import logging

from ...domain.models.upload_job import UploadJob, JobStatus
from ...core.exceptions import JobNotFoundException

logger = logging.getLogger(__name__)


class JobRepositoryInterface(ABC):
    """Interface for job repository operations."""
    
    @abstractmethod
    def save(self, job: UploadJob) -> None:
        """Save a job to storage."""
        pass
    
    @abstractmethod
    def get_by_id(self, job_id: str) -> Optional[UploadJob]:
        """Retrieve a job by its ID."""
        pass
    
    @abstractmethod
    def get_all(self) -> List[UploadJob]:
        """Get all jobs."""
        pass
    
    @abstractmethod
    def delete(self, job_id: str) -> bool:
        """Delete a job by ID."""
        pass


class InMemoryJobRepository(JobRepositoryInterface):
    """In-memory implementation of job repository with file persistence."""
    
    def __init__(self, persistence_file: Optional[str] = "upload_jobs.json"):
        self._jobs: Dict[str, UploadJob] = {}
        self._lock = threading.Lock()
        self._persistence_file = persistence_file
        self._load_jobs()
    
    def save(self, job: UploadJob) -> None:
        """Save job to memory and persist to file."""
        try:
            with self._lock:
                self._jobs[job.job_id] = job
                self._persist_jobs()
            logger.debug(f"Saved job {job.job_id} with status {job.status.value}")
        except Exception as e:
            logger.error(f"Failed to save job {job.job_id}: {e}")
            raise
    
    def get_by_id(self, job_id: str) -> Optional[UploadJob]:
        """Get job by ID."""
        with self._lock:
            return self._jobs.get(job_id)
    
    def get_all(self) -> List[UploadJob]:
        """Get all jobs."""
        with self._lock:
            return list(self._jobs.values())
    
    def delete(self, job_id: str) -> bool:
        """Delete a job by ID."""
        try:
            with self._lock:
                if job_id in self._jobs:
                    del self._jobs[job_id]
                    self._persist_jobs()
                    logger.debug(f"Deleted job {job_id}")
                    return True
                return False
        except Exception as e:
            logger.error(f"Failed to delete job {job_id}: {e}")
            raise
    
    def _persist_jobs(self) -> None:
        """Persist jobs to file."""
        try:
            if not self._persistence_file:
                return

            serializable_jobs = {}
            for job_id, job in self._jobs.items():
                serializable_jobs[job_id] = job.to_dict()

            parent_dir = os.path.dirname(self._persistence_file)
            if parent_dir:
                os.makedirs(parent_dir, exist_ok=True)
            
            with open(self._persistence_file, 'w') as f:
                json.dump(serializable_jobs, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to persist jobs to file: {e}")
            # Don't raise exception as this shouldn't break the main operation
    
    def _load_jobs(self) -> None:
        """Load jobs from file on startup."""
        try:
            if not self._persistence_file:
                logger.info("Upload job persistence disabled (in-memory mode)")
                return

            if not os.path.exists(self._persistence_file):
                logger.info("No existing jobs file found")
                return
            
            with open(self._persistence_file, 'r') as f:
                saved_jobs = json.load(f)
            
            for job_id, job_data in saved_jobs.items():
                try:
                    job = UploadJob.from_dict(job_data)
                    self._jobs[job_id] = job
                except Exception as e:
                    logger.warning(f"Failed to load job {job_id}: {e}")
            
            logger.info(f"Loaded {len(self._jobs)} jobs from file")
        except Exception as e:
            logger.warning(f"Failed to load jobs from file: {e}")


# Compatibility wrapper to work with existing code
class LegacyJobRepositoryAdapter:
    """Adapter to make the new repository work with existing global variables."""
    
    def __init__(self, repository: JobRepositoryInterface):
        self.repository = repository
    
    def sync_with_legacy(self, legacy_jobs_dict: Dict, legacy_lock: threading.Lock) -> None:
        """Sync repository with legacy global upload_jobs dict."""
        try:
            # Import existing jobs into repository
            with legacy_lock:
                for job_id, legacy_job in legacy_jobs_dict.items():
                    # Convert legacy job (dataclass) to domain model if needed
                    if hasattr(legacy_job, 'job_id'):
                        # It's already a proper dataclass, convert to domain model
                        domain_job = self._convert_legacy_job(legacy_job)
                        self.repository.save(domain_job)
            
            logger.info("Synced legacy jobs with new repository")
        except Exception as e:
            logger.error(f"Failed to sync with legacy jobs: {e}")
    
    def _convert_legacy_job(self, legacy_job) -> UploadJob:
        """Convert legacy job format to domain model."""
        # Handle status conversion
        status = legacy_job.status
        if isinstance(status, str):
            status = JobStatus(status)
        
        return UploadJob(
            job_id=legacy_job.job_id,
            filename=legacy_job.filename,
            graph_name=legacy_job.graph_name,
            timestamp=legacy_job.timestamp,
            status=status,
            progress=legacy_job.progress,
            total_triples=legacy_job.total_triples,
            processed_triples=legacy_job.processed_triples,
            current_batch=legacy_job.current_batch,
            total_batches=legacy_job.total_batches,
            error_message=legacy_job.error_message,
            result_data=legacy_job.result_data
        )