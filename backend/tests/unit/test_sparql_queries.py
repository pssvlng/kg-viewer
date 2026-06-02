"""
Unit tests for SPARQLQueries constants and get_query factory.
"""
import pytest
from src.infrastructure.constants.sparql_queries import SPARQLQueries, QUERY_DEFAULTS


class TestGetQuery:
    def test_returns_formatted_query(self):
        q = SPARQLQueries.get_query("LIST_GRAPHS")
        assert "GRAPH" in q
        assert "?" in q

    def test_raises_for_unknown_query(self):
        with pytest.raises(ValueError, match="not found"):
            SPARQLQueries.get_query("DOES_NOT_EXIST")

    def test_raises_for_missing_param(self):
        with pytest.raises(ValueError, match="Missing parameter"):
            SPARQLQueries.get_query("COUNT_GRAPH_TRIPLES")  # needs graph_uri

    def test_formats_graph_uri(self):
        q = SPARQLQueries.get_query("COUNT_GRAPH_TRIPLES", graph_uri="http://ex.org/g")
        assert "http://ex.org/g" in q
        assert "GRAPH" in q

    def test_paginated_instances_includes_limit_offset(self):
        q = SPARQLQueries.get_query(
            "GET_CLASS_INSTANCES_PAGINATED",
            graph_uri="http://ex.org/g",
            class_uri="http://ex.org/Class",
            limit=50,
            offset=100,
        )
        assert "LIMIT 50" in q
        assert "OFFSET 100" in q

    def test_search_literals_includes_search_term(self):
        q = SPARQLQueries.get_query(
            "SEARCH_LITERALS",
            graph_uri="http://ex.org/g",
            search_term="hello",
            limit=10,
        )
        assert "hello" in q

    def test_entity_type_search_queries_include_class_and_term(self):
        count_q = SPARQLQueries.get_query(
            "COUNT_ENTITY_TYPE_SEARCH_RESULTS",
            graph_uri="http://ex.org/g",
            class_uri="http://ex.org/C",
            search_term="Berlin",
        )
        data_q = SPARQLQueries.get_query(
            "SEARCH_ENTITY_TYPE_RESULTS",
            graph_uri="http://ex.org/g",
            class_uri="http://ex.org/C",
            search_term="Berlin",
            limit=25,
            offset=0,
        )

        assert "http://ex.org/C" in count_q
        assert "Berlin" in count_q
        assert "http://ex.org/C" in data_q
        assert "Berlin" in data_q
        assert "LIMIT 25" in data_q

    def test_all_graph_style_queries_contain_graph_keyword(self):
        graph_scoped = [
            ("COUNT_GRAPH_TRIPLES", {"graph_uri": "http://ex.org/g"}),
            ("GET_GRAPH_CLASSES_WITH_COUNTS", {"graph_uri": "http://ex.org/g"}),
            ("GET_CLASS_INSTANCES_PAGINATED", {"graph_uri": "http://ex.org/g", "class_uri": "http://ex.org/C", "limit": 10, "offset": 0}),
            ("COUNT_ENTITY_TYPE_SEARCH_RESULTS", {"graph_uri": "http://ex.org/g", "class_uri": "http://ex.org/C", "search_term": "x"}),
            ("SEARCH_ENTITY_TYPE_RESULTS", {"graph_uri": "http://ex.org/g", "class_uri": "http://ex.org/C", "search_term": "x", "limit": 10, "offset": 0}),
            ("GET_ENTITY_OUTWARD_CONNECTIONS", {"graph_uri": "http://ex.org/g", "entity_uri": "http://ex.org/e", "max_nodes": 10}),
            ("GET_ENTITY_LITERALS", {"graph_uri": "http://ex.org/g", "entity_uri": "http://ex.org/e"}),
            ("SEARCH_LITERALS", {"graph_uri": "http://ex.org/g", "search_term": "x", "limit": 10}),
        ]
        for name, params in graph_scoped:
            q = SPARQLQueries.get_query(name, **params)
            assert "GRAPH" in q, f"{name} should use GRAPH keyword, not FROM"
            assert "FROM" not in q.upper().split("GRAPH")[0], f"{name} still has legacy FROM"


class TestQueryDefaults:
    def test_defaults_present(self):
        assert QUERY_DEFAULTS["limit"] == 100
        assert QUERY_DEFAULTS["offset"] == 0
        assert QUERY_DEFAULTS["max_nodes"] == 50
