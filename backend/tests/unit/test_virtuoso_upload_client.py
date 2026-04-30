"""
Unit tests for VirtuosoUploadClient (network calls mocked).
"""
import pytest
from unittest.mock import MagicMock, patch, call
from rdflib import Graph, URIRef, Literal
import requests

from src.infrastructure.external.virtuoso_upload_client import (
    VirtuosoUploadClientInterface,
    VirtuosoUploadClient,
    _DEFAULT_BATCH_SIZE,
)


def _make_graph(triple_count: int = 3) -> Graph:
    g = Graph()
    for i in range(triple_count):
        g.add((URIRef(f"http://ex.org/s{i}"), URIRef("http://ex.org/p"), Literal(f"v{i}")))
    return g


@pytest.fixture()
def client():
    return VirtuosoUploadClient(
        virtuoso_url="http://localhost:8890",
        username="dba",
        password="secret",
    )


class TestVirtuosoUploadClientInterface:
    def test_cannot_instantiate_interface(self):
        with pytest.raises(TypeError):
            VirtuosoUploadClientInterface()


class TestStoreDataInBatches:
    def test_raises_for_empty_graph_uri(self, client):
        with pytest.raises(ValueError, match="graph_uri"):
            client.store_data_in_batches("", _make_graph())

    def test_returns_true_on_successful_upload(self, client):
        fake_resp = MagicMock()
        fake_resp.status_code = 200
        with patch.object(client._session, "post", return_value=fake_resp):
            result = client.store_data_in_batches("http://ex.org/g", _make_graph(2))
        assert result is True

    def test_returns_false_on_http_error(self, client):
        fake_resp = MagicMock()
        fake_resp.status_code = 500
        with patch.object(client._session, "post", return_value=fake_resp):
            result = client.store_data_in_batches("http://ex.org/g", _make_graph(2))
        assert result is False

    def test_progress_callback_called(self, client):
        fake_resp = MagicMock()
        fake_resp.status_code = 200
        callback = MagicMock()
        with patch.object(client._session, "post", return_value=fake_resp):
            client.store_data_in_batches("http://ex.org/g", _make_graph(2), progress_callback=callback)
        callback.assert_called_once()

    def test_returns_false_on_connection_error(self, client):
        with patch.object(client._session, "post", side_effect=requests.ConnectionError("refused")):
            result = client.store_data_in_batches("http://ex.org/g", _make_graph(2))
        assert result is False
