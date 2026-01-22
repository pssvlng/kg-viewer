"""
New API routes using the clean architecture.
"""
import logging
import threading
from flask import Blueprint, request, jsonify
from typing import Optional
from rdflib import Graph

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

@api_bp.route('/health', methods=['GET'])
def health_check():
    """Health check using new architecture."""
    try:
        if not NEW_SERVICES_AVAILABLE:
            return jsonify({"error": "New architecture not available"}), 503
        
        response = HealthResponse(
            status="healthy",
            service="Knowledge Graph Viewer Backend",
            virtuoso_url="http://virtuoso:8890",
            sparql_endpoint="http://virtuoso:8890/sparql", 
            external_virtuoso_url="http://localhost:8890"
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
                "maxUploadSize": "100MB",
                "supportedFormats": ["turtle", "rdf", "nt", "n3"],
                "virtuosoEndpoint": "http://virtuoso:8890/sparql"
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
            
        # Validate file type
        if not file.filename.lower().endswith('.ttl'):
            return jsonify({"error": "File must be a TTL file"}), 400
            
        graph_name = request.form.get('graphName', 'default').strip()
        
        # Read and parse TTL file content
        ttl_content = file.read().decode('utf-8')
        graph = Graph()
        graph.parse(data=ttl_content, format='turtle')
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
        
        # Create graph URI
        if graph_name == 'default':
            graph_uri = 'http://localhost:8080/graph/default'
        else:
            graph_uri = f'http://localhost:8080/graph/{graph_name}'
        
        # Get basic graph statistics
        count_query = SPARQLQueries.get_query('COUNT_GRAPH_TRIPLES', graph_uri=graph_uri)
        
        count_result = query_sparql(count_query)
        total_triples = 0
        if count_result and len(count_result) > 0:
            total_triples = int(count_result[0]['count']['value'])
        
        # Get class statistics (entity types)
        class_query = SPARQLQueries.get_query('GET_GRAPH_CLASSES_WITH_COUNTS', 
                                              graph_uri=graph_uri, limit=20)
        
        class_results = query_sparql(class_query)
        entity_types = []
        
        if class_results:
            for result in class_results:
                class_uri = result['class']['value']
                count = int(result['count']['value'])
                
                # Extract label from URI
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
                    "message": f"Graph analysis completed for {graph_name}",
                    "graphId": graph_name,
                    "graphName": graph_name,
                    "graphUri": graph_uri,
                    "triplesCount": total_triples,
                    "sparqlEndpoint": "http://localhost:8890/sparql",
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
                    "graphName": graph_name,
                    "graphUri": graph_uri,
                    "sparqlEndpoint": "http://localhost:8890/sparql"
                }
            })
        
        return jsonify({
            "success": True,
            "graphName": graph_name,
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
        from urllib.parse import unquote
        
        # Decode the class URI
        class_uri = unquote(class_uri)
        
        # Create graph URI
        if graph_name == 'default':
            graph_uri = 'http://localhost:8080/graph/default'
        else:
            graph_uri = f'http://localhost:8080/graph/{graph_name}'
        
        # Get pagination parameters
        page = int(request.args.get('page', 0))
        size = int(request.args.get('size', 10))
        offset = page * size
        
        # Get search/filter parameter
        search = request.args.get('search', '').strip()
        
        # Build SPARQL query for instances with proper search filtering
        if search:
            # First get all instances, then filter after we get their labels
            search_applied_later = True
            search_filter = ""
        else:
            search_applied_later = False
            search_filter = ""
        
        # First get the instances with pagination (without search filter for now)
        instances_query = f"""
        SELECT DISTINCT ?instance WHERE {{
            GRAPH <{graph_uri}> {{
                ?instance a <{class_uri}> .
            }}
        }}
        ORDER BY ?instance
        """
        
        if not search:
            instances_query = SPARQLQueries.get_query('GET_CLASS_INSTANCES_PAGINATED',
                                                      graph_uri=graph_uri, class_uri=class_uri,
                                                      limit=size, offset=offset)
        
        # Get total count for pagination (without search for now)
        count_query = SPARQLQueries.get_query('COUNT_CLASS_INSTANCES_SIMPLE',
                                              graph_uri=graph_uri, class_uri=class_uri)
        
        instances_result = query_sparql(instances_query)
        count_result = query_sparql(count_query)
        
        total_count = 0
        if count_result and len(count_result) > 0:
            total_count = int(count_result[0]['count']['value'])
        
        # Process results into table format with original structure
        data_rows = []
        all_rows = []  # For search filtering
        
        if instances_result:
            for result in instances_result:
                instance_uri = result['instance']['value']
                
                # Extract readable instance label
                if '#' in instance_uri:
                    instance_label = instance_uri.split('#')[-1]
                elif '/' in instance_uri:
                    instance_label = instance_uri.split('/')[-1]
                else:
                    instance_label = instance_uri
                
                # Create row with original structure (label, uri)
                row = {
                    'label': instance_label,  # Use label field as expected
                    'uri': instance_uri       # Use uri field as expected
                }
                
                # Get a few key properties to enhance the label if possible
                props_query = SPARQLQueries.get_query('GET_ENTITY_PROPERTIES',
                                                      graph_uri=graph_uri, entity_uri=instance_uri)
                
                props_result = query_sparql(props_query)
                if props_result and len(props_result) > 0:
                    # Use the first label/name/title found
                    label_value = props_result[0]['value']['value']
                    if label_value and len(label_value.strip()) > 0:
                        row['label'] = label_value.strip()
                
                all_rows.append(row)
        
        # Apply search filtering after getting labels
        if search:
            search_lower = search.lower()
            filtered_rows = []
            for row in all_rows:
                if (search_lower in row['label'].lower() or 
                    search_lower in row['uri'].lower()):
                    filtered_rows.append(row)
            all_rows = filtered_rows
            total_count = len(all_rows)
        
        # Apply pagination to filtered results
        start_idx = offset
        end_idx = start_idx + size
        data_rows = all_rows[start_idx:end_idx]
        
        return jsonify({
            "success": True,
            "data": data_rows,
            "totalElements": total_count,
            "totalPages": (total_count + size - 1) // size,
            "size": size,
            "number": page
        })
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
        
        # Create graph URI
        if graph_name == 'default':
            graph_uri = 'http://localhost:8080/graph/default'
        else:
            graph_uri = f'http://localhost:8080/graph/{graph_name}'
        
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
            "graphName": graph_name,
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
        from urllib.parse import unquote
        
        # Decode the entity URI
        entity_uri = unquote(entity_uri)
        
        # Create graph URI
        if graph_name == 'default':
            graph_uri = 'http://localhost:8080/graph/default'
        else:
            graph_uri = f'http://localhost:8080/graph/{graph_name}'
        
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
            # Fallback to URI fragment
            return uri.split('/')[-1] if '/' in uri else uri.split('#')[-1] if '#' in uri else uri
        
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
                    pred_label = pred_uri.split('/')[-1] if '/' in pred_uri else pred_uri.split('#')[-1] if '#' in pred_uri else pred_uri
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
                    pred_label = pred_uri.split('/')[-1] if '/' in pred_uri else pred_uri.split('#')[-1] if '#' in pred_uri else pred_uri
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
                            
                            pred_label = pred_uri.split('/')[-1] if '/' in pred_uri else pred_uri.split('#')[-1] if '#' in pred_uri else pred_uri
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
                            
                            pred_label = pred_uri.split('/')[-1] if '/' in pred_uri else pred_uri.split('#')[-1] if '#' in pred_uri else pred_uri
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
        from urllib.parse import unquote
        
        # Decode the entity URI
        entity_uri = unquote(entity_uri)
        
        # Create graph URI
        if graph_name == 'default':
            graph_uri = 'http://localhost:8080/graph/default'
        else:
            graph_uri = f'http://localhost:8080/graph/{graph_name}'
        
        # SPARQL query to get literal properties
        sparql_query = SPARQLQueries.get_query('GET_ENTITY_LITERALS',
                                               graph_uri=graph_uri, entity_uri=entity_uri)
        
        results = query_sparql(sparql_query)
        literals = []
        
        if results:
            for result in results:
                pred_uri = result['predicate']['value']
                value = result['value']['value']
                
                # Extract readable predicate label
                pred_label = pred_uri.split('/')[-1] if '/' in pred_uri else pred_uri.split('#')[-1] if '#' in pred_uri else pred_uri
                
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
    """Delete graph."""
    try:
        return jsonify({
            "success": False,
            "message": "Graph deletion not implemented yet in clean architecture"
        })
    except Exception as e:
        logger.error(f"Delete graph failed: {e}")
        return jsonify({"error": "Service error"}), 500

def register_api_routes(app):
    """Register API routes with the Flask app."""
    if NEW_SERVICES_AVAILABLE:
        app.register_blueprint(api_bp)