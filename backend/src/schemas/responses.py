"""
Pydantic models for API responses.
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any, Union
from datetime import datetime
from enum import Enum


class JobStatus(str, Enum):
    """Job status enumeration."""
    PROCESSING = "processing"
    FAILED = "failed" 
    SUCCESS = "success"


class UploadResponse(BaseModel):
    """Response model for file upload."""
    
    success: bool
    message: str
    job_id: Optional[str] = Field(None, alias="jobId")
    filename: Optional[str] = None
    graph_name: Optional[str] = Field(None, alias="graphName")
    triples_count: Optional[int] = Field(None, alias="triplesCount")
    error: Optional[str] = None
    
    class Config:
        populate_by_name = True


class AnalysisProgress(BaseModel):
    """Analysis progress model."""
    
    progress: float
    status: str
    timestamp: str


class EntityStats(BaseModel):
    """Entity statistics model."""
    
    entity_types: List[Dict[str, Any]] = Field(alias="entityTypes")
    total_types: int = Field(alias="totalTypes")
    total_entities: int = Field(alias="totalEntities")
    
    class Config:
        populate_by_name = True


class JobStatusResponse(BaseModel):
    """Response model for job status."""
    
    job_id: str
    filename: str
    graph_name: str
    timestamp: str
    status: JobStatus
    progress: float
    total_triples: int
    processed_triples: int
    current_batch: int
    total_batches: int
    error_message: Optional[str] = None
    result_data: Optional[Dict] = None
    analysis_progress: Optional[AnalysisProgress] = Field(None, alias="analysisProgress")
    entity_stats: Optional[EntityStats] = Field(None, alias="entityStats")
    
    class Config:
        populate_by_name = True
    
    @classmethod
    def from_upload_job(cls, job: 'UploadJob', analysis_progress: Optional[Dict] = None, entity_stats: Optional[Dict] = None):
        """Create response from UploadJob domain model."""
        analysis_prog = None
        if analysis_progress:
            analysis_prog = AnalysisProgress(**analysis_progress)
        
        entity_st = None
        if entity_stats:
            entity_st = EntityStats(**entity_stats)
        
        return cls(
            job_id=job.job_id,
            filename=job.filename,
            graph_name=job.graph_name,
            timestamp=job.timestamp.isoformat(),
            status=JobStatus(job.status) if isinstance(job.status, str) else job.status,
            progress=job.progress,
            total_triples=job.total_triples,
            processed_triples=job.processed_triples,
            current_batch=job.current_batch,
            total_batches=job.total_batches,
            error_message=job.error_message,
            result_data=job.result_data,
            analysis_progress=analysis_prog,
            entity_stats=entity_st
        )


class HealthResponse(BaseModel):
    """Response model for health check."""
    
    status: str
    service: str
    virtuoso_url: str
    sparql_endpoint: str
    external_virtuoso_url: str


class ConfigResponse(BaseModel):
    """Response model for configuration."""
    
    success: bool
    config: Dict[str, Any]


class ClassInfo(BaseModel):
    """Class information model."""
    
    uri: str
    label: str
    instance_count: int = Field(alias="instanceCount")
    
    class Config:
        populate_by_name = True


class ClassInstance(BaseModel):
    """Class instance model."""
    
    uri: str
    label: str


class ClassInstancesResponse(BaseModel):
    """Response model for class instances."""
    
    instances: List[ClassInstance]
    total_count: int = Field(alias="totalCount")
    page: int
    page_size: int = Field(alias="pageSize")
    total_pages: int = Field(alias="totalPages")
    has_next: bool = Field(alias="hasNext")
    has_previous: bool = Field(alias="hasPrevious")
    
    class Config:
        populate_by_name = True


class GraphNode(BaseModel):
    """Graph node model."""
    
    id: str
    label: str
    uri: str
    is_central: bool = Field(False, alias="isCentral")
    node_type: Optional[str] = Field(None, alias="type")
    
    class Config:
        populate_by_name = True


class GraphEdge(BaseModel):
    """Graph edge model."""
    
    source: str
    target: str
    label: str
    predicate: str


class EntityGraphResponse(BaseModel):
    """Response model for entity graph."""
    
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    central_node: str = Field(alias="centralNode")
    
    class Config:
        populate_by_name = True


class EntityLiteral(BaseModel):
    """Entity literal property model."""
    
    predicate: str
    value: str
    predicate_label: str = Field(alias="predicateLabel")
    
    class Config:
        populate_by_name = True


class EntityLiteralsResponse(BaseModel):
    """Response model for entity literals."""
    
    literals: List[EntityLiteral]


class SearchResult(BaseModel):
    """Search result model."""
    
    entity: str
    label: str
    type: Optional[str] = None
    score: Optional[float] = None  # For ranking


class SearchResponse(BaseModel):
    """Response model for search."""
    
    results: List[SearchResult]
    total: int
    query: str


class GraphInfo(BaseModel):
    """Graph information model."""
    
    name: str
    uri: str
    triple_count: Optional[int] = Field(None, alias="tripleCount")
    
    class Config:
        populate_by_name = True


class GraphListResponse(BaseModel):
    """Response model for graph list."""
    
    graphs: List[GraphInfo]
    total: int


class GraphAnalysisData(BaseModel):
    """Graph analysis data model."""
    
    graph_name: str = Field(alias="graphName")
    graph_uri: str = Field(alias="graphUri")
    total_triples: int = Field(alias="totalTriples")
    found_classes_count: int = Field(alias="foundClassesCount")
    class_list: List[ClassInfo] = Field(alias="classList")
    predicates_list: List[Dict[str, Any]] = Field(alias="predicatesList")
    last_updated: str = Field(alias="lastUpdated")
    
    class Config:
        populate_by_name = True


class ErrorResponse(BaseModel):
    """Error response model."""
    
    error: str
    message: Optional[str] = None
    details: Optional[Dict[str, Any]] = None