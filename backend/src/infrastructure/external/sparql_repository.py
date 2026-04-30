"""
SPARQL repository abstraction — enables injecting a test double instead of
hitting a real Virtuoso instance in unit tests.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any, Optional

import requests
from requests.adapters import HTTPAdapter
from requests.auth import HTTPDigestAuth
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)


class SPARQLRepositoryInterface(ABC):
    """Abstract interface for executing SPARQL operations."""

    @abstractmethod
    def query(self, query_string: str, timeout_seconds: int = 30) -> Optional[list[dict[str, Any]]]:
        """Execute a SELECT query and return a list of binding dicts, or None on failure."""
        raise NotImplementedError

    @abstractmethod
    def execute_update(self, query_string: str, timeout_seconds: int = 120) -> bool:
        """Execute a SPARQL UPDATE/DELETE and return True on success."""
        raise NotImplementedError


class VirtuosoSPARQLRepository(SPARQLRepositoryInterface):
    """Sends SPARQL queries and updates to an OpenLink Virtuoso instance."""

    def __init__(
        self,
        sparql_endpoint: str,
        sparql_auth_endpoint: str,
        username: str,
        password: str,
    ) -> None:
        self._sparql_endpoint = sparql_endpoint
        self._sparql_auth_endpoint = sparql_auth_endpoint
        self._auth = HTTPDigestAuth(username, password)
        self._session = self._build_session()

    # ------------------------------------------------------------------
    # SPARQLRepositoryInterface
    # ------------------------------------------------------------------

    def query(self, query_string: str, timeout_seconds: int = 30) -> Optional[list[dict[str, Any]]]:
        """Execute a SELECT query against Virtuoso and return parsed results."""
        headers = {
            "Accept": "application/sparql-results+json",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        try:
            response = self._session.post(
                self._sparql_endpoint,
                data={"query": query_string},
                headers=headers,
                timeout=timeout_seconds,
            )
            response.raise_for_status()
            data = response.json()
            return data.get("results", {}).get("bindings", [])
        except requests.exceptions.Timeout:
            logger.error("SPARQL query timed out after %s seconds", timeout_seconds)
            return None
        except Exception as exc:
            logger.error("SPARQL query failed: %s", exc)
            return None

    def execute_update(self, query_string: str, timeout_seconds: int = 120) -> bool:
        """Execute a SPARQL UPDATE against the authenticated Virtuoso endpoint."""
        headers = {
            "Accept": "application/sparql-results+json",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        # Disable transactional lock exhaustion on large updates
        prefixed_query = f"DEFINE sql:log-enable 3\n{query_string}"
        try:
            response = self._session.post(
                self._sparql_auth_endpoint,
                data={"update": prefixed_query},
                headers=headers,
                auth=self._auth,
                timeout=timeout_seconds,
            )
            if response.status_code in (200, 201, 204):
                return True
            logger.error(
                "SPARQL update failed with status %s: %s",
                response.status_code,
                response.text,
            )
            return False
        except Exception as exc:
            logger.error("SPARQL update error: %s", exc)
            return False

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_session() -> requests.Session:
        session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(
            max_retries=retry_strategy,
            pool_connections=10,
            pool_maxsize=20,
        )
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session
