"""
Shared pytest fixtures for all backend tests.
"""
import os
import pytest
from unittest.mock import MagicMock, patch
from rdflib import Graph, URIRef, Literal

# Point tests at in-memory storage so no JSON file is created
os.environ.setdefault("UPLOAD_JOBS_STORAGE", "memory")

from src.infrastructure.external.sparql_repository import SPARQLRepositoryInterface
from src.infrastructure.external.virtuoso_upload_client import VirtuosoUploadClientInterface
from src.infrastructure.repositories.job_repository import InMemoryJobRepository
from src.domain.services.upload_service import UploadJobService


# ---------------------------------------------------------------------------
# Infrastructure stubs
# ---------------------------------------------------------------------------

@pytest.fixture()
def mock_sparql_repo():
    """A MagicMock that fulfils the SPARQLRepositoryInterface contract."""
    repo = MagicMock(spec=SPARQLRepositoryInterface)
    repo.query.return_value = []
    repo.execute_update.return_value = True
    return repo


@pytest.fixture()
def mock_upload_client():
    """A MagicMock that fulfils the VirtuosoUploadClientInterface contract."""
    client = MagicMock(spec=VirtuosoUploadClientInterface)
    client.store_data_in_batches.return_value = True
    return client


@pytest.fixture()
def in_memory_repo():
    """Fresh InMemoryJobRepository with no file persistence."""
    return InMemoryJobRepository(persistence_file=None)


# ---------------------------------------------------------------------------
# Service fixture
# ---------------------------------------------------------------------------

@pytest.fixture()
def upload_service(in_memory_repo, mock_upload_client, mock_sparql_repo):
    """UploadJobService wired with test doubles."""
    return UploadJobService(in_memory_repo, mock_upload_client, mock_sparql_repo)


# ---------------------------------------------------------------------------
# Flask test client
# ---------------------------------------------------------------------------

@pytest.fixture()
def app(mock_sparql_repo):
    """Flask test application using blueprint factory with mock SPARQL repo."""
    # Reset singleton so each test gets a clean service
    import src.domain.services.upload_service as svc_module
    svc_module._service_instance = None

    from flask import Flask
    from flask_cors import CORS
    from src.api_routes import create_api_blueprint

    application = Flask(__name__)
    CORS(application)
    application.config["TESTING"] = True
    application.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024

    bp = create_api_blueprint(mock_sparql_repo)
    application.register_blueprint(bp)
    return application


@pytest.fixture()
def client(app):
    return app.test_client()


# ---------------------------------------------------------------------------
# Sample RDF graph
# ---------------------------------------------------------------------------

@pytest.fixture()
def sample_rdf_graph():
    g = Graph()
    subject = URIRef("http://example.org/thing/1")
    g.add((subject, URIRef("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
           URIRef("http://example.org/Class")))
    g.add((subject, URIRef("http://www.w3.org/2000/01/rdf-schema#label"),
           Literal("Thing 1")))
    return g
