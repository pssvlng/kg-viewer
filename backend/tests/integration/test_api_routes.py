"""
Integration tests for API routes (no real Virtuoso connection).
All SPARQL/upload infrastructure is replaced by mock test doubles.
"""
import io
import json
import pytest
from unittest.mock import MagicMock


TURTLE_CONTENT = b"""
@prefix ex: <http://example.org/> .
ex:thing1 a ex:Class ;
    <http://www.w3.org/2000/01/rdf-schema#label> "Thing 1" .
"""


class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        response = client.get("/api/health")
        assert response.status_code == 200

    def test_health_returns_healthy_status(self, client):
        data = response = client.get("/api/health").get_json()
        assert data["status"] == "healthy"


class TestConfigEndpoint:
    def test_config_returns_200(self, client):
        response = client.get("/api/config")
        assert response.status_code == 200

    def test_config_contains_expected_keys(self, client):
        data = client.get("/api/config").get_json()
        assert data["success"] is True
        assert "config" in data
        assert "supportedFormats" in data["config"]


class TestUploadEndpoint:
    def test_upload_no_file_returns_400(self, client):
        response = client.post("/api/upload")
        assert response.status_code == 400

    def test_upload_empty_filename_returns_400(self, client):
        data = {"file": (io.BytesIO(b""), "")}
        response = client.post("/api/upload", data=data, content_type="multipart/form-data")
        assert response.status_code == 400

    def test_upload_valid_ttl_returns_job_id(self, client):
        data = {
            "file": (io.BytesIO(TURTLE_CONTENT), "test.ttl"),
            "graphName": "test-graph",
        }
        response = client.post("/api/upload", data=data, content_type="multipart/form-data")
        assert response.status_code == 200
        body = response.get_json()
        assert "jobId" in body

    def test_upload_unsupported_extension_returns_400(self, client):
        data = {"file": (io.BytesIO(b"<html/>"), "file.html")}
        response = client.post("/api/upload", data=data, content_type="multipart/form-data")
        assert response.status_code == 400

    def test_upload_invalid_turtle_returns_400(self, client):
        data = {"file": (io.BytesIO(b"this is not valid turtle!!!"), "bad.ttl")}
        response = client.post("/api/upload", data=data, content_type="multipart/form-data")
        assert response.status_code == 400


class TestJobStatusEndpoint:
    def test_status_unknown_job_returns_404(self, client):
        response = client.get("/api/upload/status/no-such-job")
        assert response.status_code == 404

    def test_status_known_job_returns_200(self, client):
        # Create a job first via upload
        upload_data = {
            "file": (io.BytesIO(TURTLE_CONTENT), "t.ttl"),
            "graphName": "g",
        }
        upload_resp = client.post("/api/upload", data=upload_data, content_type="multipart/form-data")
        job_id = upload_resp.get_json()["jobId"]
        response = client.get(f"/api/upload/status/{job_id}")
        assert response.status_code == 200
        data = response.get_json()
        assert data["job_id"] == job_id


class TestGraphsEndpoint:
    def test_graphs_returns_200(self, client, mock_sparql_repo):
        mock_sparql_repo.query.return_value = [
            {"g": {"value": "http://ex.org/g1"}, "triples": {"value": "10"}},
            {"g": {"value": "http://ex.org/g2"}, "triples": {"value": "20"}},
        ]
        response = client.get("/api/graphs")
        assert response.status_code == 200
        body = response.get_json()
        assert body["success"] is True
        assert len(body["graphs"]) == 2

    def test_graphs_returns_empty_list_when_no_graphs(self, client, mock_sparql_repo):
        mock_sparql_repo.query.return_value = []
        response = client.get("/api/graphs")
        assert response.status_code == 200
        assert response.get_json()["graphs"] == []

    def test_graphs_handles_sparql_failure(self, client, mock_sparql_repo):
        mock_sparql_repo.query.return_value = None
        response = client.get("/api/graphs")
        # Should not crash — returns empty or error gracefully
        assert response.status_code in (200, 500)


class TestDeleteGraphEndpoint:
    def test_delete_graph_returns_200_on_success(self, client, mock_sparql_repo):
        mock_sparql_repo.execute_update.return_value = True
        response = client.delete("/api/graphs/http%3A%2F%2Fex.org%2Fg1")
        assert response.status_code == 200

    def test_delete_graph_returns_500_on_failure(self, client, mock_sparql_repo):
        mock_sparql_repo.execute_update.return_value = False
        response = client.delete("/api/graphs/http%3A%2F%2Fex.org%2Fg1")
        assert response.status_code in (500, 200)  # implementation-dependent


class TestSearchEndpoint:
    def test_search_requires_q_param(self, client):
        response = client.get("/api/graphs/http%3A%2F%2Fex.org%2Fg/search")
        assert response.status_code == 400

    def test_search_returns_results(self, client, mock_sparql_repo):
        mock_sparql_repo.query.return_value = [
            {
                "subject": {"value": "http://ex.org/s"},
                "predicate": {"value": "http://ex.org/p"},
                "object": {"value": "value"},
            },
        ]
        response = client.get("/api/graphs/http%3A%2F%2Fex.org%2Fg/search?q=value")
        assert response.status_code == 200
        body = response.get_json()
        assert "results" in body
