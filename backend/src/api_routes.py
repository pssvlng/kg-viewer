"""
New API routes using the clean architecture.
"""
import logging
import threading
from flask import Blueprint, request, jsonify
from typing import Optional
from urllib.parse import unquote
from rdflib import Graph
from rdflib.exceptions import ParserError
from config import config

# Import new services
try:
    from src.domain.services.upload_service import create_upload_service
    from src.schemas.responses import HealthResponse, JobStatusResponse
    from src.core.exceptions import KGViewerException, JobNotFoundException
    from src.infrastructure.constants.sparql_queries import SPARQLQueries, QUERY_DEFAULTS
    NEW_SERVICES_AVAILABLE = True
except ImportError:
    NEW_SERVICES_AVAILABLE = False

logger = logging.getLogger(__name__)

# Create blueprint for new API endpoints
api_bp = Blueprint('api', __name__, url_prefix='/api')

SUPPORTED_FILE_EXTENSIONS = {"ttl"}
PREFERRED_RDF_FORMATS = {
    "ttl": ["turtle"],
}


def _get_file_extension(filename: str) -> str:
    if not filename or "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


def _parse_uploaded_rdf_file(file_storage):
    filename = file_storage.filename or ""
    extension = _get_file_extension(filename)

    if extension not in SUPPORTED_FILE_EXTENSIONS:
        raise ValueError("Unsupported file type. Allowed format: ttl")

    raw_content = file_storage.read()
    if not raw_content:
        raise ValueError("Uploaded file is empty")

    parse_errors = []
    for rdf_format in PREFERRED_RDF_FORMATS.get(extension, []):
        graph = Graph()
        try:
            graph.parse(data=raw_content, format=rdf_format)
            return graph
        except (ParserError, Exception) as exc:
            parse_errors.append(f"{rdf_format}: {exc}")

    raise ValueError(
        f"Invalid RDF content for .{extension} file. Please upload a valid RDF file in one of the supported formats."
    )


def _resolve_graph_uri(graph_name: str) -> str:
    """Resolve graph URI from query string override, URI value, or graph name."""
    graph_uri_override = request.args.get('graphUri', '').strip()
    if graph_uri_override:
        return unquote(graph_uri_override)

    if graph_name.startswith('http://') or graph_name.startswith('https://'):
        return graph_name

    if not graph_name or graph_name == 'default':
        return config.default_graph_uri

    return config.get_graph_uri(graph_name)


def _extract_graph_name(graph_name: str, graph_uri: str) -> str:
    """Return a display graph name, preferring explicit route name when available."""
    if graph_name and graph_name != 'default' and not graph_name.startswith('http://') and not graph_name.startswith('https://'):
        return graph_name

    trimmed_uri = graph_uri.rstrip('/')
    if not trimmed_uri:
        return config.default_graph_name
    return trimmed_uri.split('/')[-1] or config.default_graph_name

@api_bp.route('/health', methods=['GET'])
def health_check():
    """Health check using new architecture."""
    try:
        if not NEW_SERVICES_AVAILABLE:
            return jsonify({"error": "New architecture not available"}), 503
        
        response = HealthResponse(
            status="healthy",
            service="Knowledge Graph Viewer Backend",
            virtuoso_url=config.virtuoso_url,
            sparql_endpoint=config.virtuoso_sparql_endpoint,
            external_virtuoso_url=config.external_virtuoso_url
        )
        
        return jsonify(response.model_dump())
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({"error": "Health check failed"}), 500

@api_bp.route('/config', methods=['GET'])
def get_config():
    """Config endpoint using new architecture."""
    try:
        config_data = {
            "success": True,
            "config": {
                **config.to_dict(),
                "maxUploadSize": "100MB",
                "supportedFormats": ["ttl"],
                "virtuosoEndpoint": config.virtuoso_sparql_endpoint
            }
        }
        return jsonify(config_data)
    except Exception as e:
        logger.error(f"Config failed: {e}")
        return jsonify({"error": "Config service error"}), 500

@api_bp.route('/upload/status/<job_id>', methods=['GET'])
def get_upload_status(job_id: str):
    """Get upload job status using new architecture."""
    try:
        if not NEW_SERVICES_AVAILABLE:
            return jsonify({"error": "Service not available"}), 503
        
        service = create_upload_service()
        job = service.get_job(job_id)
        
        if not job:
            return jsonify({"error": f"Job {job_id} not found"}), 404
        
        response = JobStatusResponse.from_upload_job(job)
        return jsonify(response.model_dump(by_alias=True))
        
    except Exception as e:
        logger.error(f"Job status failed: {e}")
        return jsonify({"error": f"Service error: {str(e)}"}), 500

@api_bp.route('/upload', methods=['POST'])
def upload_file():
    """Upload file using new architecture."""
    try:
        if not NEW_SERVICES_AVAILABLE:
            return jsonify({"error": "Service not available"}), 503
            
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
            
        graph = _parse_uploaded_rdf_file(file)

        graph_name = request.form.get('graphName', 'default').strip()
        total_triples = len(graph)
        
        # Create upload job and start processing
        service = create_upload_service()
        job = service.create_job(file.filename, graph_name, total_triples)
        
        # Start background processing using new architecture
        service.process_file(job.job_id, graph)
        
        response = {
            "success": True,
            "message": "File upload started",
            "jobId": job.job_id,
            "filename": file.filename,
            "graphName": graph_name
        }
        
        return jsonify(response)
        
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

@api_bp.route('/upload/analysis_progress/<job_id>', methods=['GET'])
def get_analysis_progress(job_id: str):
    """Get upload analysis progress - for frontend compatibility."""
    try:
        # For now, return empty progress since we don't have analysis phase
        return jsonify({
            "progress": 0,
            "status": "not_started",
            "message": "Analysis not implemented yet"
        })
    except Exception as e:
        logger.error(f"Analysis progress failed: {e}")
        return jsonify({"error": "Service error"}), 500

@api_bp.route('/graphs', methods=['GET'])
def get_graphs():
    """Get graphs list."""
    try:
        # Query Virtuoso for actual graphs
        import sys
        import os
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        sys.path.append(backend_dir)
        from virtuoso import query_sparql
        
        # SPARQL query to get all graphs with triple counts
        sparql_query = SPARQLQueries.get_query('LIST_GRAPHS_WITH_COUNTS')
        
        results = query_sparql(sparql_query)
        graphs = []
        
        print(f"DEBUG: SPARQL results: {results}")  # Debug line
        
        if results and isinstance(results, list):
            for binding in results:
                if 'g' in binding and 'triples' in binding:
                    graph_uri = binding['g']['value']
                    triple_count = int(binding['triples']['value'])
                    
                    # Skip system graphs but include user graphs  
                    if any(system_prefix in graph_uri for system_prefix in [
                        'http://www.w3.org/', 'http://www.openlinksw.com/', 
                        'http://localhost:8890/DAV/', 'http://localhost:8890/sparql',
                        'urn:activitystreams-owl'
                    ]):
                        continue
                    
                    # Extract graph name from URI
                    if 'graph/' in graph_uri:
                        graph_name = graph_uri.split('graph/')[-1]
                    else:
                        graph_name = graph_uri.split('/')[-1] or graph_uri
                    
                    graphs.append({
                        "name": graph_name,
                        "uri": graph_uri,
                        "tripleCount": triple_count
                    })
        
        return jsonify({
            "success": True,
            "graphs": graphs,
            "count": len(graphs)
        })
        
    except Exception as e:
        logger.error(f"Get graphs failed: {e}")
        return jsonify({
            "success": False,
            "graphs": [],
            "count": 0,
            "error": f"Failed to load graphs: {str(e)}"
        })

# Graph analysis endpoint - clean architecture
@api_bp.route('/graphs/<path:graph_name>/analysis', methods=['GET'])
def get_graph_analysis(graph_name: str):
    """Get graph analysis with same functionality as legacy system."""
    try:
        import sys
        import os
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        sys.path.append(backend_dir)
        from virtuoso import query_sparql
        
        graph_uri = _resolve_graph_uri(graph_name)
        resolved_graph_name = _extract_graph_name(graph_name, graph_uri)
        
        # Get basic graph statistics
        count_query = SPARQLQueries.get_query('COUNT_GRAPH_TRIPLES', graph_uri=graph_uri)
        
        count_result = query_sparql(count_query)
        total_triples = 0
        if count_result and len(count_result) > 0:
            total_triples = int(count_result[0]['count']['value'])
        
        # Get class statistics (entity types)
        class_query = SPARQLQueries.get_query('GET_GRAPH_CLASSES_WITH_COUNTS', 
                              graph_uri=graph_uri)
        
        class_results = query_sparql(class_query)
        entity_types = []
        
        if class_results:
            for result in class_results:
                class_uri = result['class']['value']
                count = int(result['count']['value'])
                
                # Use classLabel if available, otherwise extract label from URI
                if 'classLabel' in result and result['classLabel']:
                    label = result['classLabel']['value']
                else:
                    # Extract label from URI with improved # handling
                    if '#' in class_uri:
                        label = class_uri.split('#')[-1]
                    elif '/' in class_uri:
                        label = class_uri.split('/')[-1]
                    else:
                        label = class_uri
                
                entity_types.append({
                    'uri': class_uri,
                    'label': label,
                    'instanceCount': count,
                    'data': []  # Will be populated when clicked
                })
        
        # Create tabs exactly like legacy system
        tabs = [
            {
                "label": "Summary",
                "type": "summary",
                "content": f"Analysis results for graph: {graph_name}",
                "uploadInfo": {
                    "status": "success",
                    "message": f"Graph analysis completed for {resolved_graph_name}",
                    "graphId": resolved_graph_name,
                    "graphName": resolved_graph_name,
                    "graphUri": graph_uri,
                    "triplesCount": total_triples,
                    "sparqlEndpoint": config.sparql_endpoint,
                    "analysisResults": {
                        "totalTriples": total_triples,
                        "foundClassesCount": len(entity_types),
                        "classList": entity_types
                    }
                }
            },
            {
                "label": "Search",
                "type": "search",
                "content": "SPARQL Search Interface",
                "uploadInfo": {
                    "graphId": resolved_graph_name,
                    "graphName": resolved_graph_name,
                    "graphUri": graph_uri,
                    "sparqlEndpoint": config.sparql_endpoint
                },
                "data": []
            }
        ]
        
        # Add entity type tabs
        for entity_type in entity_types:
            tabs.append({
                "label": f"{entity_type['label']} ({entity_type['instanceCount']})",
                "type": "table",
                "content": f"Instances of {entity_type['label']}",
                "data": [],  # Will be loaded on demand
                "uploadInfo": {
                    "classUri": entity_type['uri'],
                    "graphName": resolved_graph_name,
                    "graphUri": graph_uri,
                    "sparqlEndpoint": config.sparql_endpoint
                }
            })
        
        return jsonify({
            "success": True,
            "graphName": resolved_graph_name,
            "graphUri": graph_uri,
            "tabs": tabs,
            "analysis": {
                "totalTriples": total_triples,
                "entityTypes": len(entity_types),
                "message": f"Successfully analyzed {total_triples} triples with {len(entity_types)} entity types"
            }
        })
    except Exception as e:
        logger.error(f"Graph analysis failed: {e}")
        return jsonify({"error": f"Graph analysis failed: {str(e)}"}), 500

# Endpoint for loading entity instances (server-side data source)
@api_bp.route('/graphs/<path:graph_name>/entities/<path:class_uri>/instances', methods=['GET'])
def get_entity_instances(graph_name: str, class_uri: str):
    """Get instances of a specific entity type with pagination."""
    try:
        import sys
        import os
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        sys.path.append(backend_dir)
        from virtuoso import query_sparql
        # Decode the class URI
        class_uri = unquote(class_uri)
        graph_uri = _resolve_graph_uri(graph_name)
        
        # Get pagination parameters
        page = int(request.args.get('page', 0))
        size = int(request.args.get('size', 10))
        offset = page * size
        
        # Get total count first for pagination metadata
        count_query = SPARQLQueries.get_query('COUNT_CLASS_INSTANCES_SIMPLE',
                                              graph_uri=graph_uri, class_uri=class_uri)
        count_result = query_sparql(count_query)
        
        total_count = 0
        if count_result and len(count_result) > 0:
            total_count = int(count_result[0]['count']['value'])
        
        # Check if the requested offset exceeds Virtuoso's 10k limit
        virtuoso_limit = 10000
        if offset >= virtuoso_limit:
            # Return limit message but preserve correct total count
            return jsonify({
                "success": True,
                "data": [],
                "message": "Only first 10000 records are displayed",
                "totalElements": total_count,
                "totalPages": (total_count + size - 1) // size,
                "size": size,
                "number": page
            })
        
        # Get search/filter parameter
        search = request.args.get('search', '').strip()
        
        # Get total count first for pagination metadata - use appropriate count query
        if search:
            # Use filtered count query
            count_query = SPARQLQueries.get_query('COUNT_CLASS_INSTANCES_WITH_FILTER',
                                                  graph_uri=graph_uri, class_uri=class_uri,
                                                  filter_text=search)
        else:
            # Use regular count query
            count_query = SPARQLQueries.get_query('COUNT_CLASS_INSTANCES_SIMPLE',
                                                  graph_uri=graph_uri, class_uri=class_uri)
        
        count_result = query_sparql(count_query)
        
        total_count = 0
        if count_result and len(count_result) > 0:
            total_count = int(count_result[0]['count']['value'])
        
        # Check if the requested offset exceeds Virtuoso's 10k limit
        virtuoso_limit = 10000
        message = None
        if offset >= virtuoso_limit:
            # Return limit message but preserve correct total count
            message = "Only first 10000 records are displayed"
            return jsonify({
                "success": True,
                "data": [],
                "message": message,
                "totalElements": total_count,
                "totalPages": (total_count + size - 1) // size,
                "size": size,
                "number": page
            })
        
        # Build SPARQL query for instances with proper search filtering
        if search:
            # Use filtered query with pagination
            instances_query = SPARQLQueries.get_query('GET_CLASS_INSTANCES_WITH_FILTER',
                                                      graph_uri=graph_uri, class_uri=class_uri,
                                                      filter_text=search, limit=size, offset=offset)
        else:
            # Use regular paginated query
            instances_query = SPARQLQueries.get_query('GET_CLASS_INSTANCES_PAGINATED',
                                                      graph_uri=graph_uri, class_uri=class_uri,
                                                      limit=size, offset=offset)
        
        instances_result = query_sparql(instances_query)
        
        # Process results into table format
        data_rows = []
        
        if instances_result:
            for result in instances_result:
                instance_uri = result['instance']['value']
                
                # Use label from query if available, otherwise extract from URI
                if search and 'label' in result and result['label']:
                    instance_label = result['label']['value']
                else:
                    # Extract readable instance label from URI
                    if '#' in instance_uri:
                        instance_label = instance_uri.split('#')[-1]
                    elif '/' in instance_uri:
                        instance_label = instance_uri.split('/')[-1]
                    else:
                        instance_label = instance_uri
                
                # Create row with original structure (label, uri)
                row = {
                    'label': instance_label,
                    'uri': instance_uri
                }
                
                # For non-search queries, still try to get enhanced labels
                if not search:
                    props_query = SPARQLQueries.get_query('GET_ENTITY_PROPERTIES',
                                                          graph_uri=graph_uri, entity_uri=instance_uri)
                    
                    props_result = query_sparql(props_query)
                    if props_result and len(props_result) > 0:
                        # Use the first label/name/title found
                        label_value = props_result[0]['value']['value']
                        if label_value and len(label_value.strip()) > 0:
                            row['label'] = label_value.strip()
                
                data_rows.append(row)
        
        # Check if we should show the 10k limit message for filtered results too
        if search and total_count > virtuoso_limit and offset < virtuoso_limit:
            message = "Only first 10000 records are displayed"
        
        response_data = {
            "success": True,
            "data": data_rows,
            "totalElements": total_count,
            "totalPages": (total_count + size - 1) // size,
            "size": size,
            "number": page
        }
        
        # Add message if there is one
        if message:
            response_data["message"] = message
            
        return jsonify(response_data)
    except Exception as e:
        logger.error(f"Entity instances query failed: {e}")
        return jsonify({"error": f"Failed to load entity instances: {str(e)}"}), 500

# Search endpoint - clean architecture  
@api_bp.route('/graphs/<path:graph_name>/search', methods=['GET'])
def search_graph(graph_name: str):
    """Search within a specific graph."""
    try:
        import sys
        import os
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        sys.path.append(backend_dir)
        from virtuoso import query_sparql
        
        # Get search query
        search_query = request.args.get('q', '').strip()
        if not search_query:
            return jsonify({"success": False, "error": "No search query provided"}), 400
        
        graph_uri = _resolve_graph_uri(graph_name)
        resolved_graph_name = _extract_graph_name(graph_name, graph_uri)
        
        # SPARQL query to search for literals containing the search term
        sparql_query = SPARQLQueries.get_query('SEARCH_LITERALS',
                                               graph_uri=graph_uri, search_term=search_query,
                                               limit=100)
        
        results = query_sparql(sparql_query)
        search_results = []
        
        if results:
            for result in results:
                search_results.append({
                    'subject': result['subject']['value'],
                    'predicate': result['predicate']['value'], 
                    'object': result['object']['value']
                })
        
        return jsonify({
            "success": True,
            "results": search_results,
            "query": search_query,
            "graphName": resolved_graph_name,
            "graphUri": graph_uri,
            "count": len(search_results)
        })
        
    except Exception as e:
        logger.error(f"Graph search failed: {e}")
        return jsonify({"error": f"Search failed: {str(e)}"}), 500

# Graph visualization endpoints - clean architecture
@api_bp.route('/graphs/<path:graph_name>/entities/<path:entity_uri>/graph', methods=['GET'])
def get_entity_graph(graph_name: str, entity_uri: str):
    """Get graph visualization data for an entity."""
    try:
        import sys
        import os
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        sys.path.append(backend_dir)
        from virtuoso import query_sparql
        # Decode the entity URI
        entity_uri = unquote(entity_uri)
        graph_uri = _resolve_graph_uri(graph_name)
        
        # Get parameters
        depth = int(request.args.get('depth', 1))
        max_nodes = int(request.args.get('maxNodes', 50))
        direction = request.args.get('direction', 'both')
        
        # Build SPARQL query based on direction
        if direction == 'outward':
            # Entity as subject
            sparql_query = SPARQLQueries.get_query('GET_ENTITY_OUTWARD_CONNECTIONS',
                                                   graph_uri=graph_uri, entity_uri=entity_uri,
                                                   max_nodes=max_nodes)
        elif direction == 'inward':
            # Entity as object  
            sparql_query = SPARQLQueries.get_query('GET_ENTITY_INWARD_CONNECTIONS',
                                                   graph_uri=graph_uri, entity_uri=entity_uri,
                                                   max_nodes=max_nodes)
        else:  # both
            sparql_query = SPARQLQueries.get_query('GET_ENTITY_BIDIRECTIONAL_CONNECTIONS',
                                                   graph_uri=graph_uri, entity_uri=entity_uri,
                                                   max_nodes=max_nodes)
        
        results = query_sparql(sparql_query)
        nodes = []
        edges = []
        node_ids = set()
        
        # Helper function to get label for an entity
        def get_entity_label(uri):
            label_query = SPARQLQueries.get_query('GET_ENTITY_LABEL',
                                                  graph_uri=graph_uri, entity_uri=uri)
            label_result = query_sparql(label_query)
            if label_result and len(label_result) > 0:
                return label_result[0]['label']['value']
            # Fallback to URI fragment - prioritize # over /
            if '#' in uri:
                return uri.split('#')[-1]
            elif '/' in uri:
                return uri.split('/')[-1]
            else:
                return uri
        
        # Helper function to get predicate label
        def get_predicate_label(uri, sparql_result=None):
            # First check if we already have the predicate label from SPARQL result
            if sparql_result and 'predicateLabel' in sparql_result and sparql_result['predicateLabel']:
                return sparql_result['predicateLabel']['value']
            # Fallback to URI fragment with improved # handling
            if '#' in uri:
                return uri.split('#')[-1]
            elif '/' in uri:
                return uri.split('/')[-1]
            else:
                return uri
        
        # Add central node with proper label
        central_id = entity_uri
        central_label = get_entity_label(entity_uri)
        nodes.append({
            'id': central_id,
            'label': central_label,
            'uri': entity_uri,
            'isCentral': True
        })
        node_ids.add(central_id)
        
        if results:
            for result in results:
                if direction == 'outward':
                    pred_uri = result['predicate']['value']
                    obj_uri = result['object']['value']
                    
                    # Add object node
                    if obj_uri not in node_ids:
                        obj_label = get_entity_label(obj_uri)
                        nodes.append({
                            'id': obj_uri,
                            'label': obj_label,
                            'uri': obj_uri
                        })
                        node_ids.add(obj_uri)
                    
                    # Add edge
                    pred_label = get_predicate_label(pred_uri, result)
                    edges.append({
                        'id': f"{central_id}-{pred_uri}-{obj_uri}",
                        'source': central_id,
                        'target': obj_uri,
                        'label': pred_label,
                        'uri': pred_uri
                    })
                    
                elif direction == 'inward':
                    subj_uri = result['subject']['value']
                    pred_uri = result['predicate']['value']
                    
                    # Add subject node
                    if subj_uri not in node_ids:
                        subj_label = get_entity_label(subj_uri)
                        nodes.append({
                            'id': subj_uri,
                            'label': subj_label,
                            'uri': subj_uri
                        })
                        node_ids.add(subj_uri)
                    
                    # Add edge
                    pred_label = get_predicate_label(pred_uri, result)
                    edges.append({
                        'id': f"{subj_uri}-{pred_uri}-{central_id}",
                        'source': subj_uri,
                        'target': central_id,
                        'label': pred_label,
                        'uri': pred_uri
                    })
                else:  # both
                    if 'subject' in result and 'object' in result:
                        subj_uri = result['subject']['value']
                        pred_uri = result['predicate']['value']
                        obj_uri = result['object']['value']
                        
                        # Determine direction
                        if subj_uri == entity_uri:
                            # Outward edge
                            if obj_uri not in node_ids:
                                obj_label = get_entity_label(obj_uri)
                                nodes.append({
                                    'id': obj_uri,
                                    'label': obj_label,
                                    'uri': obj_uri
                                })
                                node_ids.add(obj_uri)
                            
                            pred_label = get_predicate_label(pred_uri, result)
                            edges.append({
                                'id': f"{central_id}-{pred_uri}-{obj_uri}",
                                'source': central_id,
                                'target': obj_uri,
                                'label': pred_label,
                                'uri': pred_uri
                            })
                        else:
                            # Inward edge
                            if subj_uri not in node_ids:
                                subj_label = get_entity_label(subj_uri)
                                nodes.append({
                                    'id': subj_uri,
                                    'label': subj_label,
                                    'uri': subj_uri
                                })
                                node_ids.add(subj_uri)
                            
                            pred_label = get_predicate_label(pred_uri, result)
                            edges.append({
                                'id': f"{subj_uri}-{pred_uri}-{central_id}",
                                'source': subj_uri,
                                'target': central_id,
                                'label': pred_label,
                                'uri': pred_uri
                            })
        
        return jsonify({
            'nodes': nodes,
            'edges': edges,
            'centralNode': central_id
        })
        
    except Exception as e:
        logger.error(f"Entity graph query failed: {e}")
        return jsonify({"error": f"Failed to load entity graph: {str(e)}"}), 500

@api_bp.route('/graphs/<path:graph_name>/entities/<path:entity_uri>/literals', methods=['GET'])
def get_entity_literals(graph_name: str, entity_uri: str):
    """Get literal properties for an entity."""
    try:
        import sys
        import os
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        sys.path.append(backend_dir)
        from virtuoso import query_sparql
        # Decode the entity URI
        entity_uri = unquote(entity_uri)
        graph_uri = _resolve_graph_uri(graph_name)
        
        # SPARQL query to get literal properties
        sparql_query = SPARQLQueries.get_query('GET_ENTITY_LITERALS',
                                               graph_uri=graph_uri, entity_uri=entity_uri)
        
        results = query_sparql(sparql_query)
        literals = []
        
        if results:
            for result in results:
                pred_uri = result['predicate']['value']
                value = result['value']['value']
                
                # Use predicateLabel if available, otherwise extract from URI
                if 'predicateLabel' in result and result['predicateLabel']:
                    pred_label = result['predicateLabel']['value']
                else:
                    # Extract readable predicate label with improved # handling
                    if '#' in pred_uri:
                        pred_label = pred_uri.split('#')[-1]
                    elif '/' in pred_uri:
                        pred_label = pred_uri.split('/')[-1]
                    else:
                        pred_label = pred_uri
                
                literals.append({
                    'predicate': pred_uri,
                    'predicateLabel': pred_label,
                    'value': value
                })
        
        return jsonify(literals)
        
    except Exception as e:
        logger.error(f"Entity literals query failed: {e}")
        return jsonify({"error": f"Failed to load entity literals: {str(e)}"}), 500

# Graph deletion endpoint - clean architecture
@api_bp.route('/graphs/<path:graph_name>', methods=['DELETE'])
def delete_graph(graph_name: str):
    """Delete graph using chunked deletion for large graphs."""
    try:
        import sys
        import os
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        sys.path.append(backend_dir)
        from virtuoso import query_sparql
        
        graph_uri = _resolve_graph_uri(graph_name)
        
        # First, check how many triples are in the graph
        count_query = SPARQLQueries.get_query('COUNT_GRAPH_TRIPLES', graph_uri=graph_uri)

        def _get_remaining_triples() -> int:
            count_result = query_sparql(count_query, timeout_seconds=60)
            if count_result is None:
                raise RuntimeError("Failed to query graph triple count")
            if not count_result:
                return 0
            return int(count_result[0]['count']['value'])

        total_triples = _get_remaining_triples()
        
        logger.info(f"Starting deletion of graph {graph_uri} with {total_triples} triples")
        
        # If it's a small graph (< 50k triples), use direct DROP
        if total_triples < 50000:
            delete_query = SPARQLQueries.get_query('DELETE_GRAPH', graph_uri=graph_uri)
            query_sparql(delete_query, timeout_seconds=120)
            logger.info(f"Small graph deleted directly: {graph_uri}")
        else:
            # For large graphs, use chunked deletion
            batch_size = 10000
            deleted_batches = 0
            previous_remaining = total_triples
            stalled_batches = 0
            
            while True:
                # Delete a batch of triples
                batch_query = SPARQLQueries.get_query('DELETE_GRAPH_BATCH', 
                                                    graph_uri=graph_uri, 
                                                    batch_size=batch_size)
                
                query_sparql(batch_query, timeout_seconds=120)
                deleted_batches += 1
                
                # Check if there are still triples left
                remaining = _get_remaining_triples()
                
                logger.info(f"Deleted batch {deleted_batches}, remaining triples: {remaining}")

                if remaining >= previous_remaining:
                    stalled_batches += 1
                else:
                    stalled_batches = 0
                previous_remaining = remaining

                # Abort when no progress is made for several iterations.
                if stalled_batches >= 3:
                    raise RuntimeError(
                        f"Deletion stalled for graph {graph_uri}; remaining triples stay at {remaining}"
                    )
                
                # If no triples left, break
                if remaining == 0:
                    break
                    
                # Safety check to prevent infinite loop
                if deleted_batches > 1000:  # Max 10 million triples in 1000 batches
                    raise RuntimeError(f"Deletion stopped after {deleted_batches} batches")
            
            # Finally drop the empty graph to clean up metadata
            try:
                drop_query = SPARQLQueries.get_query('DELETE_GRAPH', graph_uri=graph_uri)
                query_sparql(drop_query, timeout_seconds=60)
                logger.info(f"Graph metadata cleaned up: {graph_uri}")
            except Exception as e:
                logger.warning(f"Failed to clean up graph metadata: {e}")
        
        remaining_after_delete = _get_remaining_triples()
        if remaining_after_delete > 0:
            logger.error(
                f"Graph deletion incomplete for {graph_uri}: {remaining_after_delete} triples remain"
            )
            return jsonify({
                "success": False,
                "message": (
                    f"Deletion incomplete for graph '{graph_name}'. "
                    f"{remaining_after_delete} triples still remain."
                )
            }), 500

        logger.info(f"Successfully deleted graph: {graph_uri}")
        return jsonify({
            "success": True,
            "message": f"Graph '{graph_name}' deleted successfully ({total_triples} triples removed)"
        })
        
    except Exception as e:
        logger.error(f"Delete graph failed: {e}")
        return jsonify({
            "success": False, 
            "message": f"Failed to delete graph: {str(e)}"
        }), 500

def register_api_routes(app):
    """Register API routes with the Flask app."""
    if NEW_SERVICES_AVAILABLE:
        app.register_blueprint(api_bp)