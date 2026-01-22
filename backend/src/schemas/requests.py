"""
Pydantic models for API requests.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional


class UploadFileRequest(BaseModel):
    """Request model for file upload."""
    
    graph_name: Optional[str] = Field(default="", description="Name of the graph to upload to")
    
    @field_validator('graph_name')
    @classmethod
    def validate_graph_name(cls, v):
        """Validate graph name."""
        if v is None:
            return ""
        return v.strip()


class GraphAnalysisRequest(BaseModel):
    """Request model for graph analysis."""
    
    graph_name: str = Field(..., description="Name of the graph to analyze")


class ClassInstancesRequest(BaseModel):
    """Request model for class instances."""
    
    page: int = Field(default=1, ge=1, description="Page number")
    page_size: int = Field(default=25, ge=1, le=100, description="Page size")
    filter_text: Optional[str] = Field(default="", description="Filter text")
    
    @field_validator('filter_text')
    @classmethod
    def validate_filter(cls, v):
        """Validate filter text."""
        if v is None:
            return ""
        return v.strip()


class EntityGraphRequest(BaseModel):
    """Request model for entity graph."""
    
    depth: int = Field(default=1, ge=1, le=3, description="Graph depth")
    max_nodes: int = Field(default=50, ge=1, le=200, description="Maximum nodes")
    direction: str = Field(default="both", pattern="^(in|out|both)$", description="Direction")


class SearchRequest(BaseModel):
    """Request model for search."""
    
    query: str = Field(..., min_length=1, description="Search query")
    limit: int = Field(default=50, ge=1, le=100, description="Result limit")