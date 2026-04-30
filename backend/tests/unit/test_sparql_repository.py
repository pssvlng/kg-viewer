"""
Unit tests for VirtuosoSPARQLRepository (network calls mocked).
"""
import pytest
from unittest.mock import MagicMock, patch
import requests

from src.infrastructure.external.sparql_repository import (
    SPARQLRepositoryInterface,
    VirtuosoSPARQLRepository,
)


SPARQL_ENDPOINT = "http://localhost:8890/sparql"
AUTH_ENDPOINT = "http://localhost:8890/sparql-auth"


@pytest.fixture()
def repo():
    return VirtuosoSPARQLRepository(
        sparql_endpoint=SPARQL_ENDPOINT,
        sparql_auth_endpoint=AUTH_ENDPOINT,
        username="dba",
        password="secret",
    )


class TestSPARQLRepositoryInterface:
    def test_interface_cannot_be_instantiated(self):
        with pytest.raises(TypeError):
            SPARQLRepositoryInterface()


class TestVirtuosoSPARQLRepositoryQuery:
    def test_query_returns_bindings_on_success(self, repo):
        fake_response = MagicMock()
        fake_response.status_code = 200
        fake_response.json.return_value = {
            "results": {
                "bindings": [
                    {"graph": {"value": "http://ex.org/g"}}
                ]
            }
        }
        with patch.object(repo._session, "post", return_value=fake_response):
            result = repo.query("SELECT ?graph WHERE { GRAPH ?graph {} }")
        assert result is not None
        assert len(result) == 1
        assert result[0]["graph"]["value"] == "http://ex.org/g"

    def test_query_returns_none_on_http_error(self, repo):
        fake_response = MagicMock()
        fake_response.status_code = 500
        fake_response.raise_for_status.side_effect = requests.HTTPError("500")
        fake_response.json.side_effect = Exception("not called")
        with patch.object(repo._session, "post", return_value=fake_response):
            result = repo.query("SELECT * WHERE {}")
        assert result is None

    def test_query_returns_none_on_connection_error(self, repo):
        with patch.object(repo._session, "post", side_effect=requests.ConnectionError("refused")):
            result = repo.query("SELECT * WHERE {}")
        assert result is None

    def test_query_returns_empty_list_for_no_bindings(self, repo):
        fake_response = MagicMock()
        fake_response.status_code = 200
        fake_response.json.return_value = {"results": {"bindings": []}}
        with patch.object(repo._session, "post", return_value=fake_response):
            result = repo.query("SELECT * WHERE {}")
        assert result == []


class TestVirtuosoSPARQLRepositoryUpdate:
    def test_execute_update_returns_true_on_success(self, repo):
        fake_response = MagicMock()
        fake_response.status_code = 200
        with patch.object(repo._session, "post", return_value=fake_response):
            assert repo.execute_update("DELETE WHERE { GRAPH <x> { ?s ?p ?o } }") is True

    def test_execute_update_returns_false_on_error(self, repo):
        with patch.object(repo._session, "post", side_effect=requests.ConnectionError("refused")):
            assert repo.execute_update("DELETE WHERE {}") is False
