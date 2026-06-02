import os
import socket
from dataclasses import dataclass
from urllib.parse import urlparse, urlunparse

from dotenv import load_dotenv


def _load_environment() -> None:
    """Load .env files for local development before reading config values."""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(current_dir)

    # Prefer backend-local .env if present, then repo-level .env.
    load_dotenv(os.path.join(current_dir, '.env'), override=False)
    load_dotenv(os.path.join(repo_root, '.env'), override=False)


_load_environment()


def _host_is_resolvable(hostname: str) -> bool:
    try:
        socket.getaddrinfo(hostname, None)
        return True
    except socket.gaierror:
        return False


def _resolve_local_service_url(url: str) -> str:
    """Fallback Docker service hostnames to localhost when running outside Docker."""
    if not url:
        return url

    parsed = urlparse(url)
    host = parsed.hostname
    if not host:
        return url

    docker_hosts = {"virtuoso", "lodview"}
    if host not in docker_hosts or _host_is_resolvable(host):
        return url

    netloc = "localhost"
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"

    return urlunparse((parsed.scheme, netloc, parsed.path, parsed.params, parsed.query, parsed.fragment))

@dataclass
class Config:
    """Application configuration class that reads from environment variables"""
    
    # Service URLs. Defaults target local host so backend can run outside Docker.
    virtuoso_url: str = _resolve_local_service_url(
        os.getenv('VIRTUOSO_URL', 'http://localhost:8890')
    )
    lodview_url: str = _resolve_local_service_url(
        os.getenv('LODVIEW_URL', 'http://localhost:8080')
    )
    
    # External URLs (browser-accessible)
    external_virtuoso_url: str = os.getenv('EXTERNAL_VIRTUOSO_URL', 'http://localhost:8890')
    external_lodview_url: str = os.getenv('EXTERNAL_LODVIEW_URL', 'http://localhost:8080')
    external_backend_url: str = os.getenv('EXTERNAL_BACKEND_URL', 'http://localhost:5000')
    external_frontend_url: str = os.getenv('EXTERNAL_FRONTEND_URL', 'http://localhost:4200')
    
    # Graph configuration
    graph_base_uri: str = os.getenv('GRAPH_BASE_URI', '').strip() or 'http://localhost:8080/graph/'
    default_graph_name: str = os.getenv('DEFAULT_GRAPH_NAME', 'default')

    # Public SPARQL endpoint (browser-accessible)
    sparql_endpoint: str = os.getenv('SPARQL_ENDPOINT', '').strip() or 'http://localhost:8890/sparql'
    
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

    # Upload job storage
    app_data_dir: str = os.getenv('APP_DATA_DIR', '/tmp/kg-viewer')
    upload_jobs_storage: str = os.getenv('UPLOAD_JOBS_STORAGE', 'file').lower()
    upload_jobs_file: str = os.getenv(
        'UPLOAD_JOBS_FILE',
        os.path.join(os.getenv('APP_DATA_DIR', '/tmp/kg-viewer'), 'upload_jobs.json')
    )
    
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
        if self.default_graph_name.startswith('http://') or self.default_graph_name.startswith('https://'):
            return self.default_graph_name

        base_prefix = self.graph_base_uri.rstrip('/')
        if not base_prefix.endswith('/graph'):
            base_prefix = f"{base_prefix}/graph"
        return f"{base_prefix}/{self.default_graph_name}"
    
    def get_graph_uri(self, graph_name: str) -> str:
        """Get a graph URI for the given graph name"""
        if not graph_name or graph_name == 'default':
            return self.default_graph_uri
        if graph_name.startswith('http://') or graph_name.startswith('https://'):
            return graph_name

        base_prefix = self.graph_base_uri.rstrip('/')
        if not base_prefix.endswith('/graph'):
            base_prefix = f"{base_prefix}/graph"
        return f"{base_prefix}/{graph_name}"
    
    def get_external_graph_uri(self, graph_name: str) -> str:
        """Get an external graph URI for the given graph name"""
        return self.get_graph_uri(graph_name)

    @property
    def should_persist_upload_jobs(self) -> bool:
        """Whether upload jobs should be persisted to disk."""
        return self.upload_jobs_storage == 'file'
    
    def to_dict(self) -> dict:
        """Convert config to dictionary for API responses"""
        return {
            'external_virtuoso_url': self.external_virtuoso_url,
            'external_lodview_url': self.external_lodview_url,
            'external_backend_url': self.external_backend_url,
            'external_frontend_url': self.external_frontend_url,
            'graph_base_uri': self.graph_base_uri,
            'default_graph_name': self.default_graph_name,
            'sparql_endpoint': self.sparql_endpoint,
            'upload_jobs_storage': self.upload_jobs_storage
        }

# Global config instance
config = Config()