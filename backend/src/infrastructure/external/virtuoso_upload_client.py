"""
Virtuoso RDF upload client abstraction — enables injecting a test double
instead of performing real network uploads during unit tests.
"""
from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from typing import Callable, Optional

import requests
from requests.adapters import HTTPAdapter
from requests.auth import HTTPDigestAuth
from urllib3.util.retry import Retry
from rdflib import Graph

logger = logging.getLogger(__name__)

# Batch upload endpoint uses HTTP Basic / Digest auth
_GRAPH_CRUD_PATH = "/sparql-graph-crud-auth"
_DEFAULT_BATCH_SIZE = 10_000
_INTER_BATCH_DELAY_SECONDS = 1
_RETRY_TOTAL = 3
_SINGLE_UPLOAD_TIMEOUT = 300  # seconds


ProgressCallback = Callable[[int, int, int], None]  # (batch_num, processed, total)


class VirtuosoUploadClientInterface(ABC):
    """Abstract interface for uploading RDF data to a triplestore."""

    @abstractmethod
    def store_data_in_batches(
        self,
        graph_uri: str,
        rdf_graph: Graph,
        batch_size: int = _DEFAULT_BATCH_SIZE,
        progress_callback: Optional[ProgressCallback] = None,
    ) -> bool:
        """Upload *rdf_graph* into *graph_uri*, splitting into batches.

        Calls *progress_callback(batch_num, processed_triples, total_triples)*
        after each batch.  Returns True on full success, False on failure.
        """
        raise NotImplementedError


class VirtuosoUploadClient(VirtuosoUploadClientInterface):
    """Uploads RDF data to a Virtuoso triplestore in batches via HTTP."""

    def __init__(self, virtuoso_url: str, username: str, password: str) -> None:
        self._endpoint = f"{virtuoso_url.rstrip('/')}{_GRAPH_CRUD_PATH}"
        self._auth = HTTPDigestAuth(username, password)
        self._session = self._build_session()

    # ------------------------------------------------------------------
    # VirtuosoUploadClientInterface
    # ------------------------------------------------------------------

    def store_data_in_batches(
        self,
        graph_uri: str,
        rdf_graph: Graph,
        batch_size: int = _DEFAULT_BATCH_SIZE,
        progress_callback: Optional[ProgressCallback] = None,
    ) -> bool:
        if not graph_uri:
            raise ValueError("graph_uri must not be empty")

        total_triples = len(rdf_graph)
        logger.info("Uploading %d triples in batches of %d…", total_triples, batch_size)

        if total_triples <= batch_size:
            logger.debug("File small enough for single upload")
            data = rdf_graph.serialize(format="turtle")
            success = self._upload_chunk(graph_uri, data)
            if success and progress_callback:
                progress_callback(1, total_triples, total_triples)
            return success

        total_batches = (total_triples + batch_size - 1) // batch_size
        processed_triples = 0
        triples_iter = iter(rdf_graph)

        for batch_num in range(total_batches):
            batch_graph = Graph()
            count_in_batch = 0
            try:
                while count_in_batch < batch_size:
                    batch_graph.add(next(triples_iter))
                    count_in_batch += 1
            except StopIteration:
                pass

            if count_in_batch == 0:
                break

            batch_data = batch_graph.serialize(format="turtle")
            success = self._upload_chunk(graph_uri, batch_data, timeout_seconds=10)

            if not success:
                logger.error("Batch %d/%d failed — aborting upload", batch_num + 1, total_batches)
                return False

            processed_triples += count_in_batch
            logger.debug(
                "Batch %d/%d uploaded (%d triples so far)",
                batch_num + 1,
                total_batches,
                processed_triples,
            )

            if progress_callback:
                progress_callback(batch_num + 1, processed_triples, total_triples)

            if batch_num < total_batches - 1:
                time.sleep(_INTER_BATCH_DELAY_SECONDS)

        logger.info("All %d batches uploaded successfully", total_batches)
        return True

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _upload_chunk(
        self, graph_uri: str, data: str, timeout_seconds: int = _SINGLE_UPLOAD_TIMEOUT
    ) -> bool:
        api_url = f"{self._endpoint}?graph={graph_uri}"
        headers = {"Content-type": "text/turtle"}
        for attempt in range(_RETRY_TOTAL):
            try:
                response = self._session.post(
                    api_url,
                    data=data,
                    headers=headers,
                    auth=self._auth,
                    timeout=timeout_seconds,
                )
                if response.status_code in (200, 201):
                    return True
                logger.error(
                    "Upload attempt %d: HTTP %s — %s",
                    attempt + 1,
                    response.status_code,
                    response.text[:200],
                )
                return False
            except requests.exceptions.Timeout:
                logger.warning("Upload attempt %d timed out", attempt + 1)
                if attempt < _RETRY_TOTAL - 1:
                    time.sleep(5)
            except Exception as exc:
                logger.warning("Upload attempt %d failed: %s", attempt + 1, exc)
                if attempt < _RETRY_TOTAL - 1:
                    time.sleep(2)
        return False

    @staticmethod
    def _build_session() -> requests.Session:
        session = requests.Session()
        retry = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=20)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session
