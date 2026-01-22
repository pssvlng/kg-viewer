"""
Upload service for handling file uploads and job management.
"""
import uuid
import threading
from typing import Optional, List
from datetime import datetime
from rdflib import Graph
from src.domain.models.upload_job import UploadJob, JobStatus
from src.infrastructure.repositories.job_repository import JobRepository


class UploadService:
    """Service for managing upload jobs."""
    
    def __init__(self, job_repository: JobRepository):
        self.job_repository = job_repository
    
    def create_job(self, filename: str, graph_name: str, total_triples: int = 0) -> UploadJob:
        """Create a new upload job."""
        job_id = str(uuid.uuid4())
        
        job = UploadJob(
            job_id=job_id,
            filename=filename,
            graph_name=graph_name or "default",
            timestamp=datetime.now(),
            status=JobStatus.PROCESSING,
            progress=0.0,
            total_triples=total_triples,
            processed_triples=0,
            current_batch=0,
            total_batches=max(1, (total_triples + 1999) // 2000)
        )
        
        self.job_repository.save(job)
        return job
    
    def get_job(self, job_id: str) -> Optional[UploadJob]:
        """Get a job by ID."""
        return self.job_repository.get_by_id(job_id)
    
    def update_job_progress(self, job_id: str, processed_triples: int, current_batch: int) -> bool:
        """Update job progress."""
        job = self.get_job(job_id)
        if not job:
            return False
        
        job.update_progress(current_batch, processed_triples)
        self.job_repository.save(job)
        return True
    
    def complete_job(self, job_id: str, result_data: dict = None) -> bool:
        """Mark job as completed."""
        job = self.get_job(job_id)
        if not job:
            return False
        
        job.mark_completed(result_data)
        self.job_repository.save(job)
        return True
    
    def fail_job(self, job_id: str, error_message: str) -> bool:
        """Mark job as failed."""
        job = self.get_job(job_id)
        if not job:
            return False
        
        job.mark_failed(error_message)
        self.job_repository.save(job)
        return True
    
    def list_jobs(self) -> List[UploadJob]:
        """Get all jobs."""
        return self.job_repository.list_all()
    
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
                backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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
                    self.update_job_progress(job_id, processed_triples, batch_num)
                
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
                        
                        from ..infrastructure.constants.sparql_queries import SPARQLQueries
                        results = SPARQLQueries.execute_query(classes_query)
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