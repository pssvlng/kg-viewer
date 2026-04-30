"""
Unit tests for UploadJobService.
"""
import threading
import time
import pytest
from datetime import datetime
from unittest.mock import MagicMock, call
from rdflib import Graph, URIRef, Literal

from src.domain.services.upload_service import UploadJobService
from src.domain.models.upload_job import UploadJob, JobStatus
from src.core.exceptions import JobNotFoundException, UploadProcessingException
from src.infrastructure.repositories.job_repository import InMemoryJobRepository
from src.infrastructure.external.sparql_repository import SPARQLRepositoryInterface
from src.infrastructure.external.virtuoso_upload_client import VirtuosoUploadClientInterface


def _build_service(sparql_results=None, upload_success=True):
    repo = InMemoryJobRepository(persistence_file=None)
    upload_client = MagicMock(spec=VirtuosoUploadClientInterface)
    upload_client.store_data_in_batches.return_value = upload_success
    sparql_repo = MagicMock(spec=SPARQLRepositoryInterface)
    sparql_repo.query.return_value = sparql_results or []
    return UploadJobService(repo, upload_client, sparql_repo), repo, upload_client, sparql_repo


def _simple_graph() -> Graph:
    g = Graph()
    g.add((URIRef("http://ex.org/s"), URIRef("http://ex.org/p"), Literal("o")))
    return g


class TestCreateJob:
    def test_creates_job_with_correct_fields(self):
        service, repo, _, _ = _build_service()
        job = service.create_job("data.ttl", "my-graph", total_triples=50)
        assert job.filename == "data.ttl"
        assert job.graph_name == "my-graph"
        assert job.total_triples == 50
        assert job.status == JobStatus.PROCESSING

    def test_job_persisted_in_repository(self):
        service, repo, _, _ = _build_service()
        job = service.create_job("data.ttl", "g", total_triples=10)
        stored = repo.get_by_id(job.job_id)
        assert stored is not None

    def test_total_batches_ceiling_division(self):
        service, _, _, _ = _build_service()
        job = service.create_job("d.ttl", "g", total_triples=101, batch_size=100)
        assert job.total_batches == 2  # ceil(101/100)

    def test_unique_job_ids(self):
        service, _, _, _ = _build_service()
        j1 = service.create_job("a.ttl", "g", 10)
        j2 = service.create_job("b.ttl", "g", 10)
        assert j1.job_id != j2.job_id


class TestGetJob:
    def test_get_job_returns_existing(self):
        service, _, _, _ = _build_service()
        created = service.create_job("f.ttl", "g", 5)
        fetched = service.get_job(created.job_id)
        assert fetched is not None
        assert fetched.job_id == created.job_id

    def test_get_job_returns_none_for_unknown(self):
        service, _, _, _ = _build_service()
        assert service.get_job("unknown") is None

    def test_get_job_or_raise_raises_for_unknown(self):
        service, _, _, _ = _build_service()
        with pytest.raises(JobNotFoundException):
            service.get_job_or_raise("unknown")


class TestCompleteAndFailJob:
    def test_complete_job_marks_success(self):
        service, _, _, _ = _build_service()
        job = service.create_job("f.ttl", "g", 10)
        service.complete_job(job.job_id, {"result": "ok"})
        updated = service.get_job(job.job_id)
        assert updated.status == JobStatus.SUCCESS
        assert updated.result_data == {"result": "ok"}

    def test_fail_job_marks_failed(self):
        service, _, _, _ = _build_service()
        job = service.create_job("f.ttl", "g", 10)
        service.fail_job(job.job_id, "something went wrong")
        updated = service.get_job(job.job_id)
        assert updated.status == JobStatus.FAILED
        assert updated.error_message == "something went wrong"


class TestProcessFile:
    def test_process_file_calls_upload_client(self):
        service, repo, upload_client, _ = _build_service()
        job = service.create_job("f.ttl", "g", 1)
        graph = _simple_graph()
        service.process_file(job.job_id, graph, "http://ex.org/graph")
        # Wait for background thread
        time.sleep(0.5)
        upload_client.store_data_in_batches.assert_called_once()

    def test_process_file_completes_job_on_success(self):
        service, repo, _, _ = _build_service(upload_success=True)
        job = service.create_job("f.ttl", "g", 1)
        service.process_file(job.job_id, _simple_graph(), "http://ex.org/graph")
        time.sleep(0.5)
        updated = service.get_job(job.job_id)
        assert updated.status == JobStatus.SUCCESS

    def test_process_file_fails_job_when_upload_fails(self):
        service, repo, _, _ = _build_service(upload_success=False)
        job = service.create_job("f.ttl", "g", 1)
        service.process_file(job.job_id, _simple_graph(), "http://ex.org/graph")
        time.sleep(0.5)
        updated = service.get_job(job.job_id)
        assert updated.status == JobStatus.FAILED

    def test_process_file_ignores_unknown_job_gracefully(self):
        service, _, upload_client, _ = _build_service()
        # Should not raise
        service.process_file("no-such-job", _simple_graph(), "http://ex.org/graph")
        time.sleep(0.2)
        upload_client.store_data_in_batches.assert_not_called()
