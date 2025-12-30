import os
from dataclasses import dataclass
from typing import Optional

@dataclass
class Config:
    """Application configuration class that reads from environment variables"""
    
    # Service URLs (internal Docker network)
    virtuoso_url: str = os.getenv('VIRTUOSO_URL', 'http://virtuoso:8890')
    lodview_url: str = os.getenv('LODVIEW_URL', 'http://lodview:8080')
    
    # External URLs (browser-accessible)
    external_virtuoso_url: str = os.getenv('EXTERNAL_VIRTUOSO_URL', 'http://localhost:8890')
    external_lodview_url: str = os.getenv('EXTERNAL_LODVIEW_URL', 'http://localhost:8080')
    external_backend_url: str = os.getenv('EXTERNAL_BACKEND_URL', 'http://localhost:5000')
    external_frontend_url: str = os.getenv('EXTERNAL_FRONTEND_URL', 'http://localhost:4200')
    
    # Graph configuration
    graph_base_uri: str = os.getenv('GRAPH_BASE_URI', 'http://example.org') + '/graph'
    default_graph_name: str = os.getenv('DEFAULT_GRAPH_NAME', 'default')
    
    # Flask settings
    flask_host: str = os.getenv('FLASK_HOST', '0.0.0.0')
    flask_port: int = int(os.getenv('FLASK_PORT', '5000'))
    flask_debug: bool = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    flask_env: str = os.getenv('FLASK_ENV', 'production')
    
    # Security and limits
    max_content_length: int = int(os.getenv('MAX_CONTENT_LENGTH', str(1024 * 1024 * 1024)))  # 1GB default
    
    # Virtuoso authentication
    virtuoso_user: str = os.getenv('VIRTUOSO_USER', 'dba')
    virtuoso_password: str = os.getenv('DBA_PASSWORD', 'dba')
    
    @property
    def virtuoso_sparql_endpoint(self) -> str:
        """Get the SPARQL endpoint URL"""
        return f"{self.virtuoso_url}/sparql"
    
    @property
    def external_virtuoso_sparql_endpoint(self) -> str:
        """Get the external SPARQL endpoint URL"""
        return f"{self.external_virtuoso_url}/sparql"
    
    @property
    def default_graph_uri(self) -> str:
        """Get the default graph URI"""
        return f"{self.graph_base_uri}/{self.default_graph_name}"
    
    def get_graph_uri(self, graph_name: str) -> str:
        """Get a graph URI for the given graph name"""
        if graph_name == 'default':
            return self.default_graph_uri
        return f"{self.graph_base_uri}/{graph_name}"
    
    def get_external_graph_uri(self, graph_name: str) -> str:
        """Get an external graph URI for the given graph name"""
        # For external access, we might want to use external URLs
        if graph_name == 'default':
            return self.default_graph_uri
        return f"{self.graph_base_uri}/{graph_name}"
    
    def to_dict(self) -> dict:
        """Convert config to dictionary for API responses"""
        return {
            'external_virtuoso_url': self.external_virtuoso_url,
            'external_lodview_url': self.external_lodview_url,
            'external_backend_url': self.external_backend_url,
            'external_frontend_url': self.external_frontend_url,
            'graph_base_uri': self.graph_base_uri,
            'default_graph_name': self.default_graph_name,
            'sparql_endpoint': self.external_virtuoso_sparql_endpoint
        }

# Global config instance
config = Config()