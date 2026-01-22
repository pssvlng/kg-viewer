"""
Service layer for upload job management.
"""
from typing import Optional, List, Callable
import uuid
import logging
import threading
from datetime import datetime
from rdflib import Graph

from ...domain.models.upload_job import UploadJob, JobStatus
from ...infrastructure.repositories.job_repository import JobRepositoryInterface
from ...core.exceptions import UploadProcessingException, JobNotFoundException

logger = logging.getLogger(__name__)


class UploadJobService:
    """Service for managing upload jobs."""
    
    def __init__(self, job_repository: JobRepositoryInterface):
        self._repository = job_repository
    
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
            logger.info(f"Created upload job {job_id} for file {filename}")
            return job
            
        except Exception as e:
            logger.error(f"Failed to create upload job: {e}")
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
            logger.debug(f"Updated job {job_id} progress: {job.progress:.1f}%")
        except Exception as e:
            logger.error(f"Failed to update job progress {job_id}: {e}")
            raise UploadProcessingException(f"Failed to update job progress: {str(e)}")
    
    def complete_job(self, job_id: str, result_data: dict) -> None:
        """Mark job as completed with result data."""
        try:
            job = self.get_job_or_raise(job_id)
            job.mark_completed(result_data)
            self._repository.save(job)
            logger.info(f"Completed job {job_id}")
        except Exception as e:
            logger.error(f"Failed to complete job {job_id}: {e}")
            raise UploadProcessingException(f"Failed to complete job: {str(e)}")
    
    def fail_job(self, job_id: str, error_message: str) -> None:
        """Mark job as failed."""
        try:
            job = self.get_job_or_raise(job_id)
            job.mark_failed(error_message)
            self._repository.save(job)
            logger.warning(f"Failed job {job_id}: {error_message}")
        except Exception as e:
            logger.error(f"Failed to mark job as failed {job_id}: {e}")
            # Don't raise exception here as we're already in an error state
    
    def get_all_jobs(self) -> List[UploadJob]:
        """Get all jobs."""
        return self._repository.get_all()
    
    def process_file(self, job_id: str, graph: Graph) -> None:
        """Process uploaded file in background."""
        def _process():
            try:
                job = self.get_job(job_id)
                if not job:
                    return
                
                # Import virtuoso functions
                import sys
                import os
                backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                sys.path.append(backend_dir)
                from virtuoso import storeDataToGraphInBatches
                from config import config
                
                # Create graph URI
                if not job.graph_name or job.graph_name.strip() == '' or job.graph_name == 'default':
                    graph_uri = config.default_graph_uri
                else:
                    graph_uri = config.get_graph_uri(job.graph_name)
                
                # Progress callback
                def progress_callback(batch_num, processed_triples, total_triples):
                    self.update_job_progress(job_id, batch_num, processed_triples)
                
                # Upload data with progress tracking
                success = storeDataToGraphInBatches(
                    graph_uri, 
                    graph, 
                    batch_size=2000, 
                    progress_callback=progress_callback
                )
                
                if success:
                    # Get entity type analysis for the uploaded data
                    entity_types = []
                    try:
                        print(f"Starting entity analysis for graph: {graph_uri}")
                        # Query for classes and their instance counts
                        classes_query = f"""
                        SELECT ?class (COUNT(?instance) as ?count)
                        FROM <{graph_uri}>
                        WHERE {{
                          ?instance a ?class
                        }}
                        GROUP BY ?class
                        ORDER BY DESC(?count)
                        LIMIT 50
                        """
                        
                        from virtuoso import query_sparql
                        results = query_sparql(classes_query)
                        print(f"SPARQL query results: {results}")
                        
                        if results and isinstance(results, list):
                            for binding in results:
                                class_uri = binding.get('class', {}).get('value', '')
                                count = int(binding.get('count', {}).get('value', 0))
                                
                                # Extract readable name from URI
                                if '#' in class_uri:
                                    class_name = class_uri.split('#')[-1]
                                elif '/' in class_uri:
                                    class_name = class_uri.split('/')[-1]
                                else:
                                    class_name = class_uri
                                
                                entity_types.append({
                                    "label": class_name,
                                    "uri": class_uri,
                                    "instanceCount": count
                                })

                    
                    except Exception as e:
                        # Continue with empty analysis if it fails
                        pass
                        # Continue with empty analysis if it fails
                    
                    # Create proper result data for frontend display
                    result_data = {
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
                                "sparqlEndpoint": "http://localhost:8890/sparql",
                                "analysisResults": {
                                    "totalTriples": job.total_triples,
                                    "foundClassesCount": len(entity_types),
                                    "classList": entity_types
                                }
                            }
                        }]
                    }
                    self.complete_job(job_id, result_data)
                else:
                    self.fail_job(job_id, "Failed to upload data to Virtuoso")
                    
            except Exception as e:
                self.fail_job(job_id, str(e))
        
        # Start processing in background thread
        thread = threading.Thread(target=_process, daemon=True)
        thread.start()
    
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
                logger.info(f"Cleaned up {deleted_count} old jobs")
            
            return deleted_count
        except Exception as e:
            logger.error(f"Failed to cleanup old jobs: {e}")
            return 0


# Factory function for dependency injection
def create_upload_service() -> UploadJobService:
    """Create upload service with default repository."""
    from ...infrastructure.repositories.job_repository import InMemoryJobRepository
    repository = InMemoryJobRepository()
    return UploadJobService(repository)