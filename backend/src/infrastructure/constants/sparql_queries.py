"""
SPARQL query constants and templates.
"""
from typing import Dict, Any


class SPARQLQueries:
    """Centralized SPARQL query templates."""

    # Graph management queries
    DELETE_GRAPH = """
    DELETE WHERE {{ GRAPH <{graph_uri}> {{ ?s ?p ?o }} }}
    """
    
    DELETE_GRAPH_BATCH = """
    DELETE {{
      GRAPH <{graph_uri}> {{ ?s ?p ?o }}
    }}
    WHERE {{
      GRAPH <{graph_uri}> {{ ?s ?p ?o }}
    }}
    LIMIT {batch_size}
    """

    COUNT_GRAPH_TRIPLES = """
    SELECT (COUNT(*) as ?count) WHERE {{
        GRAPH <{graph_uri}> {{ ?s ?p ?o }}
    }}
    """
    
    LIST_GRAPHS = """
    SELECT DISTINCT ?graph
    WHERE {{
      GRAPH ?graph {{ ?s ?p ?o }}
    }}
    ORDER BY ?graph
    """
    
    LIST_GRAPHS_WITH_COUNTS = """
    SELECT ?g (COUNT(*) as ?triples) 
    WHERE {{ 
        GRAPH ?g {{ ?s ?p ?o }} 
    }} 
    GROUP BY ?g 
    ORDER BY DESC(?triples)
    """
    
    GET_GRAPH_CLASSES_WITH_COUNTS = """
    SELECT ?class (COUNT(DISTINCT ?instance) as ?count) ?classLabel WHERE {{
        GRAPH <{graph_uri}> {{
            ?instance a ?class .
            FILTER(!isBlank(?class))
            OPTIONAL {{ ?class <http://www.w3.org/2000/01/rdf-schema#label> ?classLabel }}
        }}
    }}
    GROUP BY ?class ?classLabel
    ORDER BY DESC(?count)
    """
    
    GET_CLASS_INSTANCES_PAGINATED = """
    SELECT DISTINCT ?instance WHERE {{
        GRAPH <{graph_uri}> {{
            ?instance a <{class_uri}> .
        }}
    }}
    ORDER BY ?instance
    LIMIT {limit}
    OFFSET {offset}
    """

    GET_CLASS_INSTANCES_WITH_LABELS_PAGINATED = """
    SELECT ?instance (SAMPLE(?label) as ?label) WHERE {{
        GRAPH <{graph_uri}> {{
            ?instance a <{class_uri}> .
            OPTIONAL {{
                ?instance ?labelPred ?label .
                FILTER(?labelPred IN (
                    <http://www.w3.org/2000/01/rdf-schema#label>,
                    <http://xmlns.com/foaf/0.1/name>,
                    <http://schema.org/name>
                ))
            }}
        }}
    }}
    GROUP BY ?instance
    ORDER BY ?instance
    LIMIT {limit}
    OFFSET {offset}
    """
    
    GET_ALL_CLASS_INSTANCES = """
    SELECT DISTINCT ?instance WHERE {{
        GRAPH <{graph_uri}> {{
            ?instance a <{class_uri}> .
        }}
    }}
    ORDER BY ?instance
    """
    
    GET_ENTITY_TYPES_FOR_ANALYSIS = """
    SELECT ?class (COUNT(?instance) as ?count)
    WHERE {{
        GRAPH <{graph_uri}> {{
            ?instance a ?class
        }}
    }}
    GROUP BY ?class
    ORDER BY DESC(?count)
    """
    
    COUNT_CLASS_INSTANCES_SIMPLE = """
    SELECT (COUNT(DISTINCT ?instance) as ?count) WHERE {{
        GRAPH <{graph_uri}> {{
            ?instance a <{class_uri}> .
        }}
    }}
    """
    
    GET_ENTITY_PROPERTIES = """
    SELECT ?property ?value WHERE {{
        GRAPH <{graph_uri}> {{
            <{entity_uri}> ?property ?value .
            FILTER(?property IN (
                <http://www.w3.org/2000/01/rdf-schema#label>,
                <http://purl.org/dc/terms/title>,
                <http://xmlns.com/foaf/0.1/name>
            ))
        }}
    }}
    LIMIT 1
    """
    
    SEARCH_LITERALS = """
    SELECT DISTINCT ?subject ?predicate ?object WHERE {{
        GRAPH <{graph_uri}> {{
            ?subject ?predicate ?object .
            FILTER(
                isLiteral(?object) && 
                contains(lcase(str(?object)), lcase("{search_term}"))
            )
        }}
    }}
    ORDER BY ?subject ?predicate
    LIMIT {limit}
    """
    
    GET_ENTITY_OUTWARD_CONNECTIONS = """
    SELECT DISTINCT ?predicate ?object ?predicateLabel WHERE {{
        GRAPH <{graph_uri}> {{
            <{entity_uri}> ?predicate ?object .
            FILTER(!isLiteral(?object))
            OPTIONAL {{ ?predicate <http://www.w3.org/2000/01/rdf-schema#label> ?predicateLabel }}
        }}
    }}
    {max_nodes_clause}
    """
    
    GET_ENTITY_INWARD_CONNECTIONS = """
    SELECT DISTINCT ?subject ?predicate ?predicateLabel WHERE {{
        GRAPH <{graph_uri}> {{
            ?subject ?predicate <{entity_uri}> .
            FILTER(!isLiteral(?subject))
            OPTIONAL {{ ?predicate <http://www.w3.org/2000/01/rdf-schema#label> ?predicateLabel }}
        }}
    }}
    {max_nodes_clause}
    """
    
    GET_ENTITY_BIDIRECTIONAL_CONNECTIONS = """
    SELECT DISTINCT ?subject ?predicate ?object ?predicateLabel WHERE {{
        GRAPH <{graph_uri}> {{
            {{
                <{entity_uri}> ?predicate ?object .
                FILTER(!isLiteral(?object))
                BIND(<{entity_uri}> as ?subject)
                OPTIONAL {{ ?predicate <http://www.w3.org/2000/01/rdf-schema#label> ?predicateLabel }}
            }}
            UNION
            {{
                ?subject ?predicate <{entity_uri}> .
                FILTER(!isLiteral(?subject))
                BIND(<{entity_uri}> as ?object)
                OPTIONAL {{ ?predicate <http://www.w3.org/2000/01/rdf-schema#label> ?predicateLabel }}
            }}
        }}
    }}
    {max_nodes_clause}
    """
    
    GET_ENTITY_LABEL = """
    SELECT ?label WHERE {{
        GRAPH <{graph_uri}> {{
            <{entity_uri}> ?property ?label .
            FILTER(?property IN (
                <http://www.w3.org/2000/01/rdf-schema#label>,
                <http://purl.org/dc/terms/title>,
                <http://xmlns.com/foaf/0.1/name>
            ))
        }}
    }}
    LIMIT 1
    """

    GET_ENTITY_LITERALS = """
    SELECT ?predicate ?value ?predicateLabel WHERE {{
        GRAPH <{graph_uri}> {{
            <{entity_uri}> ?predicate ?value .
            FILTER(isLiteral(?value))
            OPTIONAL {{ ?predicate <http://www.w3.org/2000/01/rdf-schema#label> ?predicateLabel }}
        }}
    }}
    ORDER BY ?predicate
    """

    COUNT_CLASS_INSTANCES_WITH_FILTER = """
    SELECT (COUNT(DISTINCT ?instance) as ?count) WHERE {{
        GRAPH <{graph_uri}> {{
            ?instance a <{class_uri}> .
            OPTIONAL {{
                ?instance ?labelPred ?label .
                FILTER(?labelPred IN (
                    <http://www.w3.org/2000/01/rdf-schema#label>,
                    <http://xmlns.com/foaf/0.1/name>,
                    <http://schema.org/name>
                ))
            }}
            FILTER(
                CONTAINS(LCASE(STR(?instance)), LCASE("{filter_text}")) ||
                CONTAINS(LCASE(STR(?label)), LCASE("{filter_text}"))
            )
        }}
    }}
    """

    GET_CLASS_INSTANCES_WITH_FILTER = """
    SELECT DISTINCT ?instance ?label WHERE {{
        GRAPH <{graph_uri}> {{
            ?instance a <{class_uri}> .
            OPTIONAL {{
                ?instance ?labelPred ?label .
                FILTER(?labelPred IN (
                    <http://www.w3.org/2000/01/rdf-schema#label>,
                    <http://xmlns.com/foaf/0.1/name>,
                    <http://schema.org/name>
                ))
            }}
            FILTER(
                CONTAINS(LCASE(STR(?instance)), LCASE("{filter_text}")) ||
                CONTAINS(LCASE(STR(?label)), LCASE("{filter_text}"))
            )
        }}
    }}
    LIMIT {limit}
    OFFSET {offset}
    """

    # Performance-focused URI/label search for very large classes.
    # Uses EXISTS in FILTER to avoid OPTIONAL join explosion.
    COUNT_CLASS_INSTANCES_WITH_FILTER_FAST = """
    SELECT (COUNT(DISTINCT ?instance) as ?count) WHERE {{
        GRAPH <{graph_uri}> {{
            ?instance a <{class_uri}> .
            FILTER(
                CONTAINS(LCASE(STR(?instance)), LCASE("{filter_text}")) ||
                EXISTS {{
                    ?instance ?labelPred ?label .
                    FILTER(?labelPred IN (
                        <http://www.w3.org/2000/01/rdf-schema#label>,
                        <http://xmlns.com/foaf/0.1/name>,
                        <http://schema.org/name>
                    ))
                    FILTER(CONTAINS(LCASE(STR(?label)), LCASE("{filter_text}")))
                }}
            )
        }}
    }}
    """

    GET_CLASS_INSTANCES_WITH_FILTER_FAST = """
    SELECT ?instance (SAMPLE(?labelAny) as ?label) WHERE {{
        GRAPH <{graph_uri}> {{
            ?instance a <{class_uri}> .
            OPTIONAL {{
                ?instance ?labelPredAny ?labelAny .
                FILTER(?labelPredAny IN (
                    <http://www.w3.org/2000/01/rdf-schema#label>,
                    <http://xmlns.com/foaf/0.1/name>,
                    <http://schema.org/name>
                ))
            }}
            FILTER(
                CONTAINS(LCASE(STR(?instance)), LCASE("{filter_text}")) ||
                EXISTS {{
                    ?instance ?labelPred ?label .
                    FILTER(?labelPred IN (
                        <http://www.w3.org/2000/01/rdf-schema#label>,
                        <http://xmlns.com/foaf/0.1/name>,
                        <http://schema.org/name>
                    ))
                    FILTER(CONTAINS(LCASE(STR(?label)), LCASE("{filter_text}")))
                }}
            )
        }}
    }}
    GROUP BY ?instance
    ORDER BY ?instance
    LIMIT {limit}
    OFFSET {offset}
    """

    # Ultra-fast short-term search using only URI fragment match.
    # Avoids joins on label/literal triples to keep latency bounded on huge classes.
    COUNT_CLASS_INSTANCES_URI_FRAGMENT_FILTER = """
    SELECT (COUNT(DISTINCT ?instance) as ?count) WHERE {{
        GRAPH <{graph_uri}> {{
            ?instance a <{class_uri}> .
            FILTER(CONTAINS(LCASE(STRAFTER(STR(?instance), "#")), LCASE("{filter_text}")) ||
                   CONTAINS(LCASE(STRAFTER(STR(?instance), "/")), LCASE("{filter_text}")) ||
                   CONTAINS(LCASE(STR(?instance)), LCASE("{filter_text}")))
        }}
    }}
    """

    GET_CLASS_INSTANCES_URI_FRAGMENT_FILTER = """
    SELECT DISTINCT ?instance WHERE {{
        GRAPH <{graph_uri}> {{
            ?instance a <{class_uri}> .
            FILTER(CONTAINS(LCASE(STRAFTER(STR(?instance), "#")), LCASE("{filter_text}")) ||
                   CONTAINS(LCASE(STRAFTER(STR(?instance), "/")), LCASE("{filter_text}")) ||
                   CONTAINS(LCASE(STR(?instance)), LCASE("{filter_text}")))
        }}
    }}
    ORDER BY ?instance
    LIMIT {limit}
    OFFSET {offset}
    """

    # Fast short-term search over URI and label predicates only.
    # Avoids broad literal scans while still returning intuitive matches.
    COUNT_CLASS_INSTANCES_LABEL_URI_FILTER = """
    SELECT (COUNT(DISTINCT ?instance) as ?count) WHERE {{
        GRAPH <{graph_uri}> {{
            {{
                ?instance a <{class_uri}> .
                FILTER(CONTAINS(LCASE(STR(?instance)), LCASE("{filter_text}")))
            }}
            UNION
            {{
                ?instance a <{class_uri}> ; ?labelPred ?label .
                FILTER(?labelPred IN (
                    <http://www.w3.org/2000/01/rdf-schema#label>,
                    <http://xmlns.com/foaf/0.1/name>,
                    <http://schema.org/name>
                ))
                FILTER(CONTAINS(LCASE(STR(?label)), LCASE("{filter_text}")))
            }}
        }}
    }}
    """

    GET_CLASS_INSTANCES_LABEL_URI_FILTER = """
    SELECT DISTINCT ?instance ?label WHERE {{
        GRAPH <{graph_uri}> {{
            {{
                ?instance a <{class_uri}> ; ?labelPred ?label .
                FILTER(?labelPred IN (
                    <http://www.w3.org/2000/01/rdf-schema#label>,
                    <http://xmlns.com/foaf/0.1/name>,
                    <http://schema.org/name>
                ))
                FILTER(CONTAINS(LCASE(STR(?label)), LCASE("{filter_text}")))
            }}
            UNION
            {{
                ?instance a <{class_uri}> .
                FILTER(CONTAINS(LCASE(STR(?instance)), LCASE("{filter_text}")))
                BIND("" AS ?label)
            }}
        }}
    }}
    ORDER BY ?instance
    LIMIT {limit}
    OFFSET {offset}
    """

    # Capped literal search scoped to class instances.
    # Mirrors Search-tab matching style but restricts by class using a bounded candidate set.
    COUNT_CLASS_INSTANCES_BY_LITERAL_SEARCH_CAPPED = """
    SELECT (COUNT(DISTINCT ?instance) as ?count) WHERE {{
        GRAPH <{graph_uri}> {{
            {{
                SELECT DISTINCT ?instance WHERE {{
                    ?instance ?predicate ?object .
                    FILTER(isLiteral(?object))
                    FILTER(CONTAINS(LCASE(STR(?object)), LCASE("{search_term}")))
                }}
                LIMIT {candidate_limit}
            }}
            ?instance a <{class_uri}> .
        }}
    }}
    """

    GET_CLASS_INSTANCES_BY_LITERAL_SEARCH_CAPPED = """
    SELECT ?instance (SAMPLE(?labelAny) as ?label) WHERE {{
        GRAPH <{graph_uri}> {{
            {{
                SELECT DISTINCT ?instance WHERE {{
                    ?instance ?predicate ?object .
                    FILTER(isLiteral(?object))
                    FILTER(CONTAINS(LCASE(STR(?object)), LCASE("{search_term}")))
                }}
                LIMIT {candidate_limit}
            }}
            ?instance a <{class_uri}> .
            OPTIONAL {{
                ?instance ?labelPredAny ?labelAny .
                FILTER(?labelPredAny IN (
                    <http://www.w3.org/2000/01/rdf-schema#label>,
                    <http://xmlns.com/foaf/0.1/name>,
                    <http://schema.org/name>
                ))
            }}
        }}
    }}
    GROUP BY ?instance
    ORDER BY ?instance
    LIMIT {limit}
    OFFSET {offset}
    """

    # Dedicated entity-type tab search (searches full instance context, not only label/URI)
    COUNT_ENTITY_TYPE_SEARCH_RESULTS = """
    SELECT (COUNT(DISTINCT ?instance) as ?count) WHERE {{
        GRAPH <{graph_uri}> {{
            ?instance a <{class_uri}> .
            OPTIONAL {{
                ?instance ?labelPred ?label .
                FILTER(?labelPred IN (
                    <http://www.w3.org/2000/01/rdf-schema#label>,
                    <http://xmlns.com/foaf/0.1/name>,
                    <http://schema.org/name>
                ))
            }}
            OPTIONAL {{
                ?instance ?searchPred ?searchValue .
                FILTER(isLiteral(?searchValue))
            }}
            FILTER(
                CONTAINS(LCASE(STR(?instance)), LCASE("{search_term}")) ||
                CONTAINS(LCASE(STR(COALESCE(?label, ""))), LCASE("{search_term}")) ||
                CONTAINS(LCASE(STR(COALESCE(?searchValue, ""))), LCASE("{search_term}"))
            )
        }}
    }}
    """

    SEARCH_ENTITY_TYPE_RESULTS = """
    SELECT ?instance (SAMPLE(?label) as ?label) WHERE {{
        GRAPH <{graph_uri}> {{
            ?instance a <{class_uri}> .
            OPTIONAL {{
                ?instance ?labelPred ?label .
                FILTER(?labelPred IN (
                    <http://www.w3.org/2000/01/rdf-schema#label>,
                    <http://xmlns.com/foaf/0.1/name>,
                    <http://schema.org/name>
                ))
            }}
            OPTIONAL {{
                ?instance ?searchPred ?searchValue .
                FILTER(isLiteral(?searchValue))
            }}
            FILTER(
                CONTAINS(LCASE(STR(?instance)), LCASE("{search_term}")) ||
                CONTAINS(LCASE(STR(COALESCE(?label, ""))), LCASE("{search_term}")) ||
                CONTAINS(LCASE(STR(COALESCE(?searchValue, ""))), LCASE("{search_term}"))
            )
        }}
    }}
    GROUP BY ?instance
    ORDER BY ?instance
    LIMIT {limit}
    OFFSET {offset}
    """

    @classmethod
    def get_query(cls, query_name: str, **kwargs) -> str:
        """Get a formatted query by name."""
        query_template = getattr(cls, query_name, None)
        if not query_template:
            raise ValueError(f"Query '{query_name}' not found")
        
        try:
            return query_template.format(**kwargs)
        except KeyError as e:
            raise ValueError(f"Missing parameter for query '{query_name}': {e}")


# Query parameter defaults
QUERY_DEFAULTS = {
    'limit': 100,
    'offset': 0,
    'max_nodes': 50
}