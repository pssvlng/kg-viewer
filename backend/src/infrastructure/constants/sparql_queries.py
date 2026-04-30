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
    LIMIT {max_nodes}
    """
    
    GET_ENTITY_INWARD_CONNECTIONS = """
    SELECT DISTINCT ?subject ?predicate ?predicateLabel WHERE {{
        GRAPH <{graph_uri}> {{
            ?subject ?predicate <{entity_uri}> .
            FILTER(!isLiteral(?subject))
            OPTIONAL {{ ?predicate <http://www.w3.org/2000/01/rdf-schema#label> ?predicateLabel }}
        }}
    }}
    LIMIT {max_nodes}
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
    LIMIT {max_nodes}
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