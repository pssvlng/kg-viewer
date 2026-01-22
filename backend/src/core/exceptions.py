"""
Custom exceptions for KG Viewer application.
"""
from typing import Optional, Dict, Any


class KGViewerException(Exception):
    """Base exception for KG Viewer application."""
    
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        self.message = message
        self.details = details or {}
        super().__init__(self.message)


class JobNotFoundException(KGViewerException):
    """Raised when a job is not found."""
    pass


class GraphNotFoundException(KGViewerException):
    """Raised when a graph is not found."""
    pass


class UploadProcessingException(KGViewerException):
    """Raised when upload processing fails."""
    pass


class SPARQLQueryException(KGViewerException):
    """Raised when SPARQL query execution fails."""
    pass


class ValidationException(KGViewerException):
    """Raised when input validation fails."""
    pass