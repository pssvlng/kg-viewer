"""
Service layer for upload job management.
"""
from typing import Optional, List
import uuid
import logging
import threading
from datetime import datetime
from rdflib import Graph

from ...domain.models.upload_job import UploadJob, JobStatus
from ...infrastructure.repositories.job_repository import JobRepositoryInterface
from ...infrastructure.constants.sparql_queries import SPARQLQueries
from ...infrastructure.external.sparql_repository import SPARQLRepositoryInterface
from ...infrastructure.external.virtuoso_upload_client import VirtuosoUploadClientInterface
from ...core.exceptions import UploadProcessingException, JobNotFoundException

logger = logging.getLogger(__name__)


_service_instance_lock = threading.Lock()
_service_instance: Optional['UploadJobService'] = None


class UploadJobService:
    """Service for managing upload jobs."""
    
    def __init__(
        self,
        job_repository: JobRepositoryInterface,
        upload_client: VirtuosoUploadClientInterface,
        sparql_repository: SPARQLRepositoryInterface,
    ) -> None:
        self._repository = job_repository
        self._upload_client = upload_client
        self._sparql_repository = sparql_repository
    
    def create_job(
        self, 
        filename: str, 
        graph_name: str, 
        total_triples: int,
        batch_size: int = 2000
    ) -> UploadJob:
        """Create a new upload job."""
        try:
            job_id = str(uuid.uuid4())
            total_batches = (total_triples + batch_size - 1) // batch_size  # Ceiling division
            
            job = UploadJob(
                job_id=job_id,
                filename=filename,
                graph_name=graph_name,
                timestamp=datetime.now(),
                status=JobStatus.PROCESSING,
                progress=0.0,
                total_triples=total_triples,
                processed_triples=0,
                current_batch=0,
                total_batches=total_batches
            )
            
            self._repository.save(job)
            logger.info("Created upload job %s for file %s", job_id, filename)
            return job
            
        except Exception as e:
            logger.error("Failed to create upload job: %s", e)
            raise UploadProcessingException(f"Failed to create upload job: {str(e)}")
    
    def get_job(self, job_id: str) -> Optional[UploadJob]:
        """Retrieve a job by ID."""
        return self._repository.get_by_id(job_id)
    
    def get_job_or_raise(self, job_id: str) -> UploadJob:
        """Retrieve a job by ID or raise exception if not found."""
        job = self._repository.get_by_id(job_id)
        if not job:
            raise JobNotFoundException(f"Job {job_id} not found")
        return job
    
    def update_job_progress(
        self, 
        job_id: str, 
        current_batch: int, 
        processed_triples: int
    ) -> None:
        """Update job progress."""
        try:
            job = self.get_job_or_raise(job_id)
            job.update_progress(current_batch, processed_triples)
            self._repository.save(job)
            logger.debug("Updated job %s progress: %.1f%%", job_id, job.progress)
        except Exception as e:
            logger.error("Failed to update job progress %s: %s", job_id, e)
            raise UploadProcessingException(f"Failed to update job progress: {str(e)}")
    
    def complete_job(self, job_id: str, result_data: dict) -> None:
        """Mark job as completed with result data."""
        try:
            job = self.get_job_or_raise(job_id)
            job.mark_completed(result_data)
            self._repository.save(job)
            logger.info("Completed job %s", job_id)
        except Exception as e:
            logger.error("Failed to complete job %s: %s", job_id, e)
            raise UploadProcessingException(f"Failed to complete job: {str(e)}")
    
    def fail_job(self, job_id: str, error_message: str) -> None:
        """Mark job as failed."""
        try:
            job = self.get_job_or_raise(job_id)
            job.mark_failed(error_message)
            self._repository.save(job)
            logger.warning("Failed job %s: %s", job_id, error_message)
        except Exception as e:
            logger.error("Failed to mark job as failed %s: %s", job_id, e)
            # Don't raise — we are already handling an error state
    
    def get_all_jobs(self) -> List[UploadJob]:
        """Get all jobs."""
        return self._repository.get_all()
    
    def process_file(self, job_id: str, graph: Graph, graph_uri: str) -> None:
        """Process uploaded file in background using the injected upload client."""
        def _process() -> None:
            try:
                job = self.get_job(job_id)
                if not job:
                    logger.error("process_file: job %s not found", job_id)
                    return
                
                def progress_callback(batch_num: int, processed: int, total: int) -> None:
                    self.update_job_progress(job_id, batch_num, processed)
                
                success = self._upload_client.store_data_in_batches(
                    graph_uri,
                    graph,
                    batch_size=2000,
                    progress_callback=progress_callback,
                )
                
                if success:
                    entity_types = self._analyse_entity_types(graph_uri)
                    result_data = self._build_result_data(job, graph_uri, entity_types)
                    self.complete_job(job_id, result_data)
                else:
                    self.fail_job(job_id, "Failed to upload data to Virtuoso")
                    
            except Exception as exc:
                logger.error("Background processing failed for job %s: %s", job_id, exc)
                self.fail_job(job_id, str(exc))
        
        thread = threading.Thread(target=_process, daemon=True)
        thread.start()
    
    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _analyse_entity_types(self, graph_uri: str) -> list:
        """Query entity types and instance counts for the uploaded graph."""
        entity_types: list = []
        try:
            classes_query = SPARQLQueries.get_query(
                'GET_ENTITY_TYPES_FOR_ANALYSIS', graph_uri=graph_uri
            )
            results = self._sparql_repository.query(classes_query)
            if results and isinstance(results, list):
                for binding in results:
                    class_uri = binding.get('class', {}).get('value', '')
                    count = int(binding.get('count', {}).get('value', 0))
                    if '#' in class_uri:
                        class_name = class_uri.split('#')[-1]
                    elif '/' in class_uri:
                        class_name = class_uri.split('/')[-1]
                    else:
                        class_name = class_uri
                    entity_types.append({
                        "label": class_name,
                        "uri": class_uri,
                        "instanceCount": count,
                    })
        except Exception as exc:
            logger.warning("Entity analysis failed for %s (continuing): %s", graph_uri, exc)
        return entity_types

    @staticmethod
    def _build_result_data(job: UploadJob, graph_uri: str, entity_types: list) -> dict:
        from config import config
        return {
            "tabs": [{
                "label": "Upload Summary",
                "type": "summary",
                "content": f"Successfully uploaded {job.total_triples} triples",
                "uploadInfo": {
                    "status": "success",
                    "message": "Upload completed successfully",
                    "graphId": job.graph_name,
                    "graphName": job.graph_name,
                    "graphUri": graph_uri,
                    "triplesCount": job.total_triples,
                    "sparqlEndpoint": config.sparql_endpoint,
                    "analysisResults": {
                        "totalTriples": job.total_triples,
                        "foundClassesCount": len(entity_types),
                        "classList": entity_types,
                    },
                },
            }]
        }

    def cleanup_old_jobs(self, max_age_hours: int = 24) -> int:
        """Clean up old completed jobs."""
        try:
            from datetime import timedelta
            cutoff_time = datetime.now() - timedelta(hours=max_age_hours)
            
            all_jobs = self._repository.get_all()
            deleted_count = 0
            
            for job in all_jobs:
                if job.is_complete() and job.timestamp < cutoff_time:
                    self._repository.delete(job.job_id)
                    deleted_count += 1
            
            if deleted_count > 0:
                logger.info("Cleaned up %d old jobs", deleted_count)
            
            return deleted_count
        except Exception as e:
            logger.error("Failed to cleanup old jobs: %s", e)
            return 0


# ---------------------------------------------------------------------------
# Factory / singleton — wires up all dependencies once at process startup
# ---------------------------------------------------------------------------

def create_upload_service() -> UploadJobService:
    """Return the process-singleton UploadJobService, creating it on first call.

    A singleton ensures that upload jobs created in one request are immediately
    visible to status-polling requests in the same process.
    """
    global _service_instance

    if _service_instance is not None:
        return _service_instance

    with _service_instance_lock:
        if _service_instance is None:
            from config import config
            from ...infrastructure.repositories.job_repository import InMemoryJobRepository
            from ...infrastructure.external.sparql_repository import VirtuosoSPARQLRepository
            from ...infrastructure.external.virtuoso_upload_client import VirtuosoUploadClient

            persistence_file = config.upload_jobs_file if config.should_persist_upload_jobs else None
            repository = InMemoryJobRepository(persistence_file=persistence_file)

            sparql_repo = VirtuosoSPARQLRepository(
                sparql_endpoint=config.virtuoso_sparql_endpoint,
                sparql_auth_endpoint=f"{config.virtuoso_url}/sparql-auth",
                username=config.virtuoso_user,
                password=config.virtuoso_password,
            )

            upload_client = VirtuosoUploadClient(
                virtuoso_url=config.virtuoso_url,
                username=config.virtuoso_user,
                password=config.virtuoso_password,
            )

            _service_instance = UploadJobService(repository, upload_client, sparql_repo)

    return _service_instance

