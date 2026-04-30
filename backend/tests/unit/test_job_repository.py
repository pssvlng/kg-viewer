"""
Unit tests for InMemoryJobRepository.
"""
import pytest
from datetime import datetime
from src.infrastructure.repositories.job_repository import InMemoryJobRepository
from src.domain.models.upload_job import UploadJob, JobStatus
from src.core.exceptions import JobNotFoundException


def _make_job(job_id: str = "job-1", status: JobStatus = JobStatus.PROCESSING) -> UploadJob:
    return UploadJob(
        job_id=job_id,
        filename="file.ttl",
        graph_name="graph",
        timestamp=datetime(2024, 1, 1),
        status=status,
        progress=0.0,
        total_triples=10,
        processed_triples=0,
        current_batch=0,
        total_batches=1,
    )


@pytest.fixture()
def repo():
    return InMemoryJobRepository(persistence_file=None)


class TestInMemoryJobRepository:
    def test_save_and_get_by_id(self, repo):
        job = _make_job("j1")
        repo.save(job)
        result = repo.get_by_id("j1")
        assert result is not None
        assert result.job_id == "j1"

    def test_get_by_id_returns_none_for_missing(self, repo):
        assert repo.get_by_id("nonexistent") is None

    def test_get_all_returns_saved_jobs(self, repo):
        repo.save(_make_job("j1"))
        repo.save(_make_job("j2"))
        all_jobs = repo.get_all()
        assert len(all_jobs) == 2
        ids = {j.job_id for j in all_jobs}
        assert ids == {"j1", "j2"}

    def test_save_overwrites_existing(self, repo):
        job = _make_job("j1", status=JobStatus.PROCESSING)
        repo.save(job)
        updated = _make_job("j1", status=JobStatus.SUCCESS)
        repo.save(updated)
        result = repo.get_by_id("j1")
        assert result.status == JobStatus.SUCCESS

    def test_delete_removes_job(self, repo):
        repo.save(_make_job("j1"))
        deleted = repo.delete("j1")
        assert deleted is True
        assert repo.get_by_id("j1") is None

    def test_delete_returns_false_for_missing(self, repo):
        result = repo.delete("nonexistent")
        assert result is False

    def test_get_all_empty_initially(self, repo):
        assert repo.get_all() == []
