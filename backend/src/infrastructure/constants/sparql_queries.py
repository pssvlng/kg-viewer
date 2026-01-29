"""
SPARQL query constants and templates.
"""
from typing import Dict, Any


class SPARQLQueries:
    """Centralized SPARQL query templates."""
    
    # Graph statistics queries
    COUNT_TRIPLES = """
    SELECT (COUNT(*) as ?count)
    FROM <{graph_uri}>
    WHERE {{ ?s ?p ?o }}
    """
    
    GET_CLASSES_WITH_COUNTS = """
    SELECT ?class (COUNT(?instance) as ?count) ?classLabel
    FROM <{graph_uri}>
    WHERE {{
      ?instance a ?class
      OPTIONAL {{ ?class <http://www.w3.org/2000/01/rdf-schema#label> ?classLabel }}
    }}
    GROUP BY ?class ?classLabel
    ORDER BY DESC(?count)
    LIMIT {limit}
    """
    
    GET_PREDICATES_WITH_COUNTS = """
    SELECT ?predicate (COUNT(?usage) as ?count) ?predicateLabel
    FROM <{graph_uri}>
    WHERE {{
      ?subject ?predicate ?object .
      OPTIONAL {{ ?predicate <http://www.w3.org/2000/01/rdf-schema#label> ?predicateLabel }}
    }}
    GROUP BY ?predicate ?predicateLabel
    ORDER BY DESC(?count)
    LIMIT {limit}
    """
    
    # Instance queries
    GET_CLASS_INSTANCES = """
    SELECT DISTINCT ?instance ?label
    FROM <{graph_uri}>
    WHERE {{
      ?instance a <{class_uri}> .
      OPTIONAL {{
        ?instance ?labelPred ?label .
        FILTER(?labelPred IN (<http://www.w3.org/2000/01/rdf-schema#label>, 
                             <http://xmlns.com/foaf/0.1/name>, 
                             <http://schema.org/name>))
      }}
    }}
    LIMIT {limit}
    OFFSET {offset}
    """
    
    GET_CLASS_INSTANCES_WITH_FILTER = """
    SELECT DISTINCT ?instance ?label
    FROM <{graph_uri}>
    WHERE {{
      ?instance a <{class_uri}> .
      OPTIONAL {{
        ?instance ?labelPred ?label .
        FILTER(?labelPred IN (<http://www.w3.org/2000/01/rdf-schema#label>, 
                             <http://xmlns.com/foaf/0.1/name>, 
                             <http://schema.org/name>))
      }}
      FILTER(CONTAINS(LCASE(STR(?instance)), LCASE("{filter_text}")) || 
             CONTAINS(LCASE(STR(?label)), LCASE("{filter_text}")))
    }}
    LIMIT {limit}
    OFFSET {offset}
    """
    
    COUNT_CLASS_INSTANCES = """
    SELECT (COUNT(DISTINCT ?instance) as ?count)
    FROM <{graph_uri}>
    WHERE {{
      ?instance a <{class_uri}> .
    }}
    """
    
    COUNT_CLASS_INSTANCES_WITH_FILTER = """
    SELECT (COUNT(DISTINCT ?instance) as ?count)
    FROM <{graph_uri}>
    WHERE {{
      ?instance a <{class_uri}> .
      OPTIONAL {{
        ?instance ?labelPred ?label .
        FILTER(?labelPred IN (<http://www.w3.org/2000/01/rdf-schema#label>, 
                             <http://xmlns.com/foaf/0.1/name>, 
                             <http://schema.org/name>))
      }}
      FILTER(CONTAINS(LCASE(STR(?instance)), LCASE("{filter_text}")) || 
             CONTAINS(LCASE(STR(?label)), LCASE("{filter_text}")))
    }}
    """
    
    # Entity graph queries
    GET_ENTITY_CONNECTIONS = """
    SELECT DISTINCT ?subject ?predicate ?object ?subjectLabel ?predicateLabel ?objectLabel
    FROM <{graph_uri}>
    WHERE {{
      {{
        <{entity_uri}> ?predicate ?object .
        BIND(<{entity_uri}> AS ?subject)
      }}
      UNION
      {{
        ?subject ?predicate <{entity_uri}> .
        BIND(<{entity_uri}> AS ?object)
      }}
      # Get labels
      OPTIONAL {{ ?subject <http://www.w3.org/2000/01/rdf-schema#label> ?subjectLabel }}
      OPTIONAL {{ ?object <http://www.w3.org/2000/01/rdf-schema#label> ?objectLabel }}
      OPTIONAL {{ ?predicate <http://www.w3.org/2000/01/rdf-schema#label> ?predicateLabel }}
    }}
    LIMIT {max_nodes}
    """
    
    GET_ENTITY_LITERALS = """
    SELECT ?predicate ?value ?predicateLabel
    FROM <{graph_uri}>
    WHERE {{
      <{entity_uri}> ?predicate ?value .
      FILTER(isLiteral(?value))
      OPTIONAL {{ ?predicate <http://www.w3.org/2000/01/rdf-schema#label> ?predicateLabel }}
    }}
    ORDER BY ?predicate
    """
    
    # Search queries
    SEARCH_ENTITIES = """
    SELECT DISTINCT ?entity ?label ?type
    FROM <{graph_uri}>
    WHERE {{
      ?entity ?labelPred ?label .
      OPTIONAL {{ ?entity a ?type }}
      FILTER(?labelPred IN (<http://www.w3.org/2000/01/rdf-schema#label>, 
                           <http://xmlns.com/foaf/0.1/name>, 
                           <http://schema.org/name>))
      FILTER(CONTAINS(LCASE(?label), LCASE("{search_term}")))
    }}
    ORDER BY ?label
    LIMIT {limit}
    """
    
    # Graph management queries
    DELETE_GRAPH = """
    DROP GRAPH <{graph_uri}>
    """
    
    DELETE_GRAPH_BATCH = """
    WITH <{graph_uri}>
    DELETE {{ ?s ?p ?o }}
    WHERE {{ ?s ?p ?o }}
    LIMIT {batch_size}
    """
    
    COUNT_GRAPH_TRIPLES = """
    SELECT (COUNT(*) as ?count)
    WHERE {{ GRAPH <{graph_uri}> {{ ?s ?p ?o }} }}
    """
    
    LIST_GRAPHS = """
    SELECT DISTINCT ?graph
    WHERE {{
      GRAPH ?graph {{ ?s ?p ?o }}
    }}
    ORDER BY ?graph
    """
    
    # New queries from api_routes.py
    LIST_GRAPHS_WITH_COUNTS = """
    SELECT ?g (COUNT(*) as ?triples) 
    WHERE {{ 
        GRAPH ?g {{ ?s ?p ?o }} 
    }} 
    GROUP BY ?g 
    ORDER BY DESC(?triples)
    """
    
    COUNT_GRAPH_TRIPLES = """
    SELECT (COUNT(*) as ?count) WHERE {{
        GRAPH <{graph_uri}> {{ ?s ?p ?o }}
    }}
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
    LIMIT {limit}
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
    FROM <{graph_uri}>
    WHERE {{
      ?instance a ?class
    }}
    GROUP BY ?class
    ORDER BY DESC(?count)
    LIMIT {limit}
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