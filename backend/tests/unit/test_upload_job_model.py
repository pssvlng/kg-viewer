"""
Unit tests for the UploadJob domain model.
"""
import pytest
from datetime import datetime
from src.domain.models.upload_job import UploadJob, JobStatus


def _make_job(**overrides) -> UploadJob:
    defaults = dict(
        job_id="abc-123",
        filename="data.ttl",
        graph_name="test-graph",
        timestamp=datetime(2024, 1, 1, 12, 0),
        status=JobStatus.PROCESSING,
        progress=0.0,
        total_triples=100,
        processed_triples=0,
        current_batch=0,
        total_batches=5,
    )
    defaults.update(overrides)
    return UploadJob(**defaults)


class TestUploadJob:
    def test_creation_sets_fields(self):
        job = _make_job()
        assert job.job_id == "abc-123"
        assert job.filename == "data.ttl"
        assert job.status == JobStatus.PROCESSING
        assert job.progress == 0.0

    def test_optional_fields_default_to_none(self):
        job = _make_job()
        assert job.error_message is None
        assert job.result_data is None

    def test_update_progress_sets_values(self):
        job = _make_job(total_batches=5, total_triples=100)
        job.update_progress(current_batch=2, processed_triples=40)
        assert job.current_batch == 2
        assert job.processed_triples == 40
        assert job.progress == pytest.approx(40.0)

    def test_update_progress_rejects_negative_triples(self):
        job = _make_job()
        with pytest.raises(ValueError):
            job.update_progress(current_batch=0, processed_triples=-1)

    def test_update_progress_rejects_negative_batch(self):
        job = _make_job()
        with pytest.raises(ValueError):
            job.update_progress(current_batch=-1, processed_triples=0)

    def test_job_status_enum_values(self):
        assert JobStatus.PROCESSING.value == "processing"
        assert JobStatus.SUCCESS.value == "success"
        assert JobStatus.FAILED.value == "failed"
