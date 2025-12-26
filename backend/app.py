from flask import Flask, request, jsonify
from flask_cors import CORS
from rdflib import Graph, RDF, RDFS, URIRef
import os
import json
import uuid
import threading
import time
import math
from datetime import datetime
from dataclasses import dataclass, asdict
from typing import Dict, Optional, List
import requests
from requests.auth import HTTPDigestAuth
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from urllib.parse import quote
from virtuoso import storeDataToGraph, storeDataToGraphInBatches, query_sparql
from config import config

app = Flask(__name__)
CORS(app)

# Configure maximum upload size from config
app.config['MAX_CONTENT_LENGTH'] = config.max_content_length

# Create session for graph management (skip if requests not available)
try:
    session = requests.Session()
    retry_strategy = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=10, pool_maxsize=20)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
except:
    session = None

# Upload Job Management
@dataclass
class UploadJob:
    job_id: str
    filename: str
    graph_name: str
    timestamp: datetime
    status: str  # 'processing', 'failed', 'success'
    progress: float  # 0.0 to 100.0
    total_triples: int
    processed_triples: int
    current_batch: int
    total_batches: int
    error_message: Optional[str] = None
    result_data: Optional[Dict] = None

# In-memory job queue
upload_jobs: Dict[str, UploadJob] = {}
job_lock = threading.Lock()

# Load class definitions on startup
CLASS_DEFINITIONS = {}
URI_TO_CLASS = {}
class_definitions_file = 'references/class_definitions.json'
if os.path.exists(class_definitions_file):
    with open(class_definitions_file, 'r', encoding='utf-8') as f:
        CLASS_DEFINITIONS = json.load(f)
    
    # Create a URI-to-class mapping for faster lookups
    for class_id, class_info in CLASS_DEFINITIONS.items():
        uri = class_info.get('uri')
        if uri:
            URI_TO_CLASS[uri] = class_info

# Job Management Functions
def create_upload_job(filename: str, graph_name: str, total_triples: int) -> str:
    """Create a new upload job and return the job ID"""
    job_id = str(uuid.uuid4())
    total_batches = (total_triples + 1999) // 2000  # Ceiling division for batch size 2000
    
    with job_lock:
        upload_jobs[job_id] = UploadJob(
            job_id=job_id,
            filename=filename,
            graph_name=graph_name,
            timestamp=datetime.now(),
            status='processing',
            progress=0.0,
            total_triples=total_triples,
            processed_triples=0,
            current_batch=0,
            total_batches=total_batches
        )
    
    return job_id

def update_job_progress(job_id: str, current_batch: int, processed_triples: int):
    """Update job progress"""
    with job_lock:
        if job_id in upload_jobs:
            job = upload_jobs[job_id]
            job.current_batch = current_batch
            job.processed_triples = processed_triples
            job.progress = (processed_triples / job.total_triples) * 100.0

def complete_job(job_id: str, result_data: Dict):
    """Mark job as completed with result data"""
    with job_lock:
        if job_id in upload_jobs:
            job = upload_jobs[job_id]
            job.status = 'success'
            job.progress = 100.0
            job.result_data = result_data

def fail_job(job_id: str, error_message: str):
    """Mark job as failed with error message"""
    with job_lock:
        if job_id in upload_jobs:
            job = upload_jobs[job_id]
            job.status = 'failed'
            job.error_message = error_message

def get_job(job_id: str) -> Optional[UploadJob]:
    """Get job by ID"""
    with job_lock:
        return upload_jobs.get(job_id)

# Configuration endpoint
@app.route('/api/config', methods=['GET'])
def get_config():
    """Get application configuration for frontend"""
    return jsonify({
        "success": True,
        "config": config.to_dict()
    })

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "Knowledge Graph Viewer Backend",
        "virtuoso_url": config.virtuoso_url,
        "sparql_endpoint": config.virtuoso_sparql_endpoint,
        "external_virtuoso_url": config.external_virtuoso_url
    })

@app.route('/upload/status/<job_id>', methods=['GET'])
def get_upload_status(job_id):
    """Get upload job status and progress"""
    job = get_job(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    
    # Include analysis progress if available
    job_analysis_progress = analysis_progress.get(job_id, {})
    
    response_data = asdict(job)
    response_data['analysisProgress'] = job_analysis_progress
    
    # If job is successful, include entity statistics
    if job.status == 'success':
        try:
            # Use 'default' if graph_name is empty
            graph_name = job.graph_name if job.graph_name else 'default'
            app.logger.info(f"Getting entity statistics for graph: {graph_name}")
            entity_stats = get_entity_statistics(graph_name)
            app.logger.info(f"Entity statistics result: {entity_stats}")
            response_data['entityStats'] = entity_stats
        except Exception as e:
            app.logger.error(f"Failed to get entity statistics: {e}")
            import traceback
            app.logger.error(traceback.format_exc())
    
    return jsonify(response_data)

@app.route('/upload/analysis_progress/<job_id>', methods=['GET'])
def get_upload_analysis_progress(job_id):
    """Get analysis progress for a job"""
    progress = analysis_progress.get(job_id, {})
    if not progress:
        return jsonify({"error": "No analysis progress found"}), 404
    return jsonify(progress)

def get_entity_statistics(graph_name: str) -> dict:
    """Get entity type statistics for a graph"""
    try:
        graph_uri = config.get_graph_uri(graph_name)
        
        # Query to get all types and their counts
        query = f"""SELECT ?type (COUNT(?entity) AS ?count) 
FROM <{graph_uri}>
WHERE {{
    ?entity a ?type .
}}
GROUP BY ?type
ORDER BY DESC(?count)"""
        
        app.logger.info(f"Executing entity statistics query: {query}")
        results = query_sparql(query)
        app.logger.info(f"Query results: {results}")
        entity_types = []
        
        if results:
            for result in results:
                type_uri = str(result['type']['value'])
                count = int(result['count']['value'])
                
                # Get a readable name for the type
                type_name = get_readable_type_name(type_uri)
                
                entity_types.append({
                    'uri': type_uri,
                    'name': type_name,
                    'count': count
                })
        
        return {
            'entityTypes': entity_types,
            'totalTypes': len(entity_types),
            'totalEntities': sum(et['count'] for et in entity_types)
        }
        
    except Exception as e:
        app.logger.error(f"Error getting entity statistics: {e}")
        return {
            'entityTypes': [],
            'totalTypes': 0,
            'totalEntities': 0,
            'error': str(e)
        }

def get_readable_type_name(type_uri: str) -> str:
    """Convert URI to readable name"""
    if '#' in type_uri:
        return type_uri.split('#')[-1]
    elif '/' in type_uri:
        return type_uri.split('/')[-1]
    else:
        return type_uri

@app.route('/api/entities/<graph_name>', methods=['GET'])
def get_entities_by_type(graph_name):
    """Get entities of a specific type from a graph"""
    try:
        from urllib.parse import unquote
        type_uri = request.args.get('type')
        if not type_uri:
            return jsonify({'error': 'Missing type parameter'}), 400
        type_uri = unquote(type_uri)
        
        graph_uri = config.get_graph_uri(graph_name)
        
        # Get pagination parameters
        page = int(request.args.get('page', 1))
        limit = min(int(request.args.get('limit', 50)), 200)  # Max 200 items
        offset = (page - 1) * limit
        
        # Get search filter
        search = request.args.get('search', '').strip()
        
        # Base query
        base_query = f"""
        FROM <{graph_uri}>
        WHERE {{
            ?entity a <{type_uri}> .
            OPTIONAL {{ ?entity rdfs:label ?label }} .
            OPTIONAL {{ ?entity dc:title ?title }} .
            OPTIONAL {{ ?entity foaf:name ?name }} .
            OPTIONAL {{ ?entity skos:prefLabel ?prefLabel }} .
        """
        
        # Add search filter if provided
        if search:
            base_query += f"""
            FILTER (
                CONTAINS(LCASE(STR(?entity)), LCASE("{search}")) ||
                CONTAINS(LCASE(STR(?label)), LCASE("{search}")) ||
                CONTAINS(LCASE(STR(?title)), LCASE("{search}")) ||
                CONTAINS(LCASE(STR(?name)), LCASE("{search}")) ||
                CONTAINS(LCASE(STR(?prefLabel)), LCASE("{search}"))
            )
            """
        
        base_query += "}"
        
        # Count query
        count_query = f"SELECT (COUNT(DISTINCT ?entity) AS ?total) {base_query}"
        count_results = query_sparql(count_query)
        total = int(count_results[0]['total']['value']) if count_results else 0
        
        # Data query
        data_query = f"""
        SELECT DISTINCT ?entity ?label ?title ?name ?prefLabel 
        {base_query}
        ORDER BY ?entity
        LIMIT {limit}
        OFFSET {offset}
        """
        
        results = query_sparql(data_query)
        entities = []
        
        if results:
            for result in results:
                entity_uri = str(result['entity']['value'])
                
                # Get the best available label
                label = None
                for label_key in ['label', 'title', 'name', 'prefLabel']:
                    if result.get(label_key) and result[label_key].get('value'):
                        label = str(result[label_key]['value'])
                        break
                
                if not label:
                    # Use the last part of URI as fallback
                    label = entity_uri.split('/')[-1] or entity_uri.split('#')[-1] or entity_uri
                
                entities.append({
                    'uri': entity_uri,
                    'label': label,
                    'properties': {k: str(v['value']) for k, v in result.items() if v and v.get('value') and k != 'entity'}
                })
        
        return jsonify({
            'entities': entities,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total,
                'pages': (total + limit - 1) // limit
            }
        })
        
    except Exception as e:
        app.logger.error(f"Error getting entities by type: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/upload/jobs', methods=['GET'])
def get_all_jobs():
    """Get all upload jobs (for debugging)"""
    with job_lock:
        return jsonify([asdict(job) for job in upload_jobs.values()])

@app.route('/upload/complete/<job_id>', methods=['POST'])
def force_complete_job(job_id):
    """Force complete a stuck job (emergency endpoint)"""
    try:
        job = get_job(job_id)
        if not job:
            return jsonify({"error": "Job not found"}), 404
        
        if job.status != 'processing':
            return jsonify({"error": "Job is not in processing state"}), 400
        
        # Create minimal result data for stuck job
        minimal_result = [{
            'label': 'Summary',
            'content': f'Upload completed with {job.total_triples} triples.\nData analysis was skipped due to timeout.',
            'type': 'summary',
            'uploadInfo': {
                'status': 'Success (Timeout)',
                'message': 'TTL file uploaded successfully, analysis incomplete',
                'graphName': job.graph_name,
                'graphId': job.graph_name,
                'triplesCount': job.total_triples,
                'sparqlEndpoint': config.external_virtuoso_sparql_endpoint
            }
        }]
        
        complete_job(job_id, minimal_result)
        
        return jsonify({
            "success": True,
            "message": "Job marked as completed",
            "result": minimal_result
        })
        
    except Exception as e:
        return jsonify({"error": f"Failed to complete job: {str(e)}"}), 500

def process_upload_async(job_id: str, graph: Graph, graph_name: str):
    """Process upload in background with progress updates"""
    try:
        job = get_job(job_id)
        if not job:
            return
        
        # Create graph URI - use default if graph_name is empty
        if not graph_name or graph_name.strip() == '':
            graph_uri = config.default_graph_uri
        else:
            graph_uri = config.get_graph_uri(graph_name)
        
        sparql_endpoint = config.external_virtuoso_sparql_endpoint
        
        # Progress callback function
        def progress_callback(batch_num, processed_triples, total_triples):
            update_job_progress(job_id, batch_num, processed_triples)
        
        # Upload data with progress tracking
        success = storeDataToGraphInBatches(
            graph_uri, 
            graph, 
            batch_size=2000, 
            progress_callback=progress_callback
        )
        
        if not success:
            fail_job(job_id, "Failed to upload data to Virtuoso")
            return
        
        # Analyze the uploaded data with progress tracking
        result_data = analyze_uploaded_data_optimized(graph, graph_name, graph_uri, sparql_endpoint, job_id)
        
        # Mark job as completed
        complete_job(job_id, result_data)
        
    except Exception as e:
        fail_job(job_id, str(e))

def analyze_uploaded_data_optimized(graph, graph_name, graph_uri, sparql_endpoint, job_id):
    
    update_analysis_progress(job_id, 20, "Starting analysis...")
    
    # Use the unified analysis function
    analysis_data = create_graph_analysis_data(
        graph_uri=graph_uri,
        graph_name=graph_name,
        graph=graph,
        sparql_endpoint=sparql_endpoint
    )
    
    update_analysis_progress(job_id, 80, "Creating tabs...")
    
    # Create tabs using the unified function
    tabs = create_analysis_tabs(
        analysis_data=analysis_data,
        graph_name=graph_name,
        graph_uri=graph_uri,
        sparql_endpoint=sparql_endpoint
    )
    
    update_analysis_progress(job_id, 100, "Analysis completed!")
    
    return tabs

# Add analysis progress tracking
analysis_progress = {}

def update_analysis_progress(job_id: str, progress: float, status: str):
    """Update analysis progress"""
    analysis_progress[job_id] = {
        'progress': progress,
        'status': status,
        'timestamp': datetime.now().isoformat()
    }

def get_analysis_progress(job_id: str):
    """Get analysis progress"""
    return analysis_progress.get(job_id, {})

def create_analysis_tabs(analysis_data, graph_name, graph_uri, sparql_endpoint):
    """Create analysis tabs structure - unified for both upload and graph analysis"""
    tabs = []
    
    # Create upload info structure
    upload_info = {
        'status': 'Success',
        'message': f'Graph analysis completed successfully',
        'graphName': graph_name or 'default',
        'graphId': graph_name or 'default',
        'graphUri': graph_uri,
        'triplesCount': analysis_data.get('totalTriples', 0),
        'sparqlEndpoint': sparql_endpoint,
        'analysisResults': analysis_data
    }
    
    # Create Summary tab with integrated classes overview
    summary_content = ""  # Remove redundant text summary
    
    # Add classes overview data to upload_info for summary display
    upload_info['classesOverview'] = analysis_data.get('classList', [])
    
    tabs.append({
        'label': 'Summary',
        'content': summary_content,
        'type': 'summary',
        'uploadInfo': upload_info
    })
    
    # Create detailed tabs for each class with instances
    try:
        for class_item in list(analysis_data.get('classList', []))[:10]:
            if isinstance(class_item, dict) and class_item.get('instanceCount', 0) > 0:
                class_uri = class_item.get('uri')
                class_label = class_item.get('label', class_uri.split('/')[-1] if class_uri else 'Unknown')
                instance_count = class_item.get('instanceCount', 0)
                
                # Always use SPARQL for consistency - both upload and analysis use same logic
                instance_data = get_instance_data_from_sparql(class_uri, graph_uri)
                    
                if instance_data:
                    # Create a copy of upload_info with class-specific information
                    class_upload_info = upload_info.copy()
                    class_upload_info['classUri'] = class_uri
                    
                    tabs.append({
                        'label': f'{class_label} ({instance_count})',
                        'content': f'Instances of {class_label}',
                        'type': 'table',
                        'data': instance_data,
                        'uploadInfo': class_upload_info
                    })
                    
    except Exception as e:
        print(f"Error creating detailed class tabs: {e}")
    
    return tabs

def get_instance_data_from_sparql(class_uri, graph_uri):
    """Get instance data via SPARQL queries (graph analysis context)"""
    try:
        # Query for instances with their labels
        instances_query = f"""
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
        LIMIT 20
        """
        
        instances_result = query_sparql(instances_query)
        if not instances_result:
            return [{'label': 'No instances found', 'uri': ''}]
            
        instance_data = []
        
        for binding in instances_result[:20]:
            instance_uri = binding['instance']['value']
            
            # Get label or create one from URI
            label = None
            if 'label' in binding and binding['label']:
                label = binding['label']['value']
            
            if not label:
                if '#' in instance_uri:
                    label = instance_uri.split('#')[-1]
                elif '/' in instance_uri:
                    label = instance_uri.split('/')[-1]
                else:
                    label = instance_uri
                    
            instance_data.append({
                'label': label,
                'uri': instance_uri
            })
            
        return instance_data
        
    except Exception as e:
        print(f"Error getting instance data via SPARQL for {class_uri}: {e}")
        return [{'label': 'Error', 'uri': 'No instance data available'}]

@app.route('/upload_file', methods=['POST'])
def upload_file():
    """Upload TTL file and create processing job"""
    try:
        # Check if file was uploaded
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']
        graph_name = request.form.get('graphName', '').strip()
        
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        if not file.filename.lower().endswith('.ttl'):
            return jsonify({"error": "File must be a TTL file"}), 400
        
        # Read TTL file content
        ttl_content = file.read().decode('utf-8')
        
        # Parse TTL content with rdflib
        graph = Graph()
        graph.parse(data=ttl_content, format='turtle')
        
        total_triples = len(graph)
        
        # Create upload job
        job_id = create_upload_job(file.filename, graph_name, total_triples)
        
        # Start background processing
        thread = threading.Thread(
            target=process_upload_async,
            args=(job_id, graph, graph_name),
            daemon=True
        )
        thread.start()
        
        return jsonify({
            "success": True,
            "message": "File upload started",
            "jobId": job_id,
            "filename": file.filename,
            "graphName": graph_name or 'default',
            "triplesCount": total_triples
        })
            
    except Exception as e:
        return jsonify({"error": f"Failed to start upload: {str(e)}"}), 500

@app.route('/api/graphs', methods=['GET'])
def list_graphs():
    """List all named graphs in the system"""
    try:
        # SPARQL query to get all named graphs
        sparql_query = """
        SELECT DISTINCT ?graph
        WHERE {
          GRAPH ?graph { ?s ?p ?o }
        }
        ORDER BY ?graph
        """
        
        result = query_sparql(sparql_query)
        
        if result and isinstance(result, list):
            graphs = []
            for binding in result:
                if 'graph' in binding:
                    graph_uri = binding['graph']['value']
                    # Extract graph name from URI and filter out system graphs
                    if graph_uri.startswith(f'{config.graph_base_uri}/'):
                        graph_name = graph_uri.replace(f'{config.graph_base_uri}/', '')
                        graphs.append({
                            'name': graph_name,
                            'uri': graph_uri
                        })
                    # Skip system graphs
            
            return jsonify({
                'success': True,
                'graphs': graphs,
                'count': len(graphs)
            })
        else:
            return jsonify({
                'success': True,
                'graphs': [],
                'count': 0
            })
            
    except Exception as e:
        print(f"Error listing graphs: {e}")
        return jsonify({
            'success': False,
            'error': f'Failed to list graphs: {str(e)}'
        }), 500

@app.route('/api/graphs/<graph_name>', methods=['DELETE'])
def delete_graph(graph_name):
    """Delete a specific named graph"""
    try:
        # Construct the graph URI
        if graph_name == 'default':
            graph_uri = config.default_graph_uri
        else:
            graph_uri = config.get_graph_uri(graph_name)
        
        print(f"Attempting to delete graph: {graph_uri}")
        
        # First, check if the graph exists and get triple count
        count_query = f"""
        SELECT (COUNT(*) AS ?count)
        WHERE {{
          GRAPH <{graph_uri}> {{ ?s ?p ?o }}
        }}
        """
        
        count_result = query_sparql(count_query)
        triple_count = 0
        
        if count_result and isinstance(count_result, list) and len(count_result) > 0:
            binding = count_result[0]
            if 'count' in binding:
                triple_count = int(binding['count']['value'])
        
        if triple_count == 0:
            return jsonify({
                'success': False,
                'error': f'Graph "{graph_name}" not found or is empty'
            }), 404
        
        # Delete all triples in the graph using SPARQL UPDATE
        delete_query = f"""
        DELETE {{
          GRAPH <{graph_uri}> {{
            ?s ?p ?o
          }}
        }}
        WHERE {{
          GRAPH <{graph_uri}> {{
            ?s ?p ?o
          }}
        }}
        """
        
        # Execute the delete query using SPARQL endpoint
        if session:
            delete_url = config.virtuoso_sparql_endpoint
            headers = {'Content-Type': 'application/sparql-update'}
            
            response = session.post(
                delete_url,
                data=delete_query,
                headers=headers,
                auth=HTTPDigestAuth('dba', 'dba'),
                timeout=60
            )
            
            if response.status_code in [200, 204]:
                print(f"Successfully deleted graph {graph_uri} with {triple_count} triples")
                return jsonify({
                    'success': True,
                    'message': f'Graph "{graph_name}" deleted successfully',
                    'triples_deleted': triple_count
                })
            else:
                print(f"Failed to delete graph. Status: {response.status_code}, Response: {response.text}")
                return jsonify({
                    'success': False,
                    'error': f'Failed to delete graph. Server response: {response.status_code}'
                }), 500
        else:
            # Fallback: try using query_sparql if requests is not available
            try:
                query_sparql(delete_query)
                return jsonify({
                    'success': True,
                    'message': f'Graph "{graph_name}" deleted successfully',
                    'triples_deleted': triple_count
                })
            except Exception as fallback_error:
                return jsonify({
                    'success': False,
                    'error': f'Failed to delete graph: {str(fallback_error)}'
                }), 500
            
    except Exception as e:
        print(f"Error deleting graph {graph_name}: {e}")
        return jsonify({
            'success': False,
            'error': f'Failed to delete graph: {str(e)}'
        }), 500

def create_graph_analysis_data(graph_uri, graph_name=None, graph=None, sparql_endpoint=None):
    """Create analysis data for a specific graph - reusable for both upload analysis and graph viewing"""
    try:
        analysis_results = {
            'graphName': graph_name or graph_uri.split('/')[-1],
            'graphUri': graph_uri,
            'totalTriples': 0,
            'foundClassesCount': 0,
            'classList': [],
            'predicatesList': [],
            'lastUpdated': datetime.now().isoformat()
        }

        # If we have a graph object (from upload), analyze it directly
        if graph:
            return analyze_graph_object(graph, analysis_results)
        
        # Otherwise query the SPARQL endpoint
        endpoint_url = sparql_endpoint or f"{config.virtuoso_url}/sparql"
        return analyze_graph_via_sparql(graph_uri, endpoint_url, analysis_results)
        
    except Exception as e:
        print(f"Error in create_graph_analysis_data: {e}")
        return {
            'error': str(e),
            'graphName': graph_name or 'Unknown',
            'graphUri': graph_uri
        }

def analyze_graph_object(graph, analysis_results):
    """Analyze a graph object directly (for upload analysis)"""
    total_triples = len(graph)
    analysis_results['totalTriples'] = total_triples
    
    # Find all type assertions and classes
    class_instances = {}
    predicates_usage = {}
    
    # Extract type assertions - discover ALL classes in the data
    for subj, pred, obj in graph.triples((None, RDF.type, None)):
        class_uri = str(obj)
        subj_uri = str(subj)
        
        # Add ALL classes found, not just those in predefined definitions
        if class_uri not in class_instances:
            class_instances[class_uri] = []
        class_instances[class_uri].append(subj_uri)
    
    # Extract predicate usage
    for subj, pred, obj in graph:
        pred_uri = str(pred)
        if pred_uri not in predicates_usage:
            predicates_usage[pred_uri] = 0
        predicates_usage[pred_uri] += 1
    
    # Prepare class analysis with dynamic class discovery
    class_analysis = []
    for class_uri, instances in class_instances.items():
        # Create a readable label from the URI
        class_label = class_uri.split('/')[-1] if '/' in class_uri else class_uri.split('#')[-1] if '#' in class_uri else class_uri
        
        class_analysis.append({
            'label': class_label,
            'instanceCount': len(instances),
            'uri': class_uri
        })
    
    class_analysis.sort(key=lambda x: x['instanceCount'], reverse=True)
    
    # Prepare predicate analysis
    predicates_analysis = []
    for pred_uri, count in sorted(predicates_usage.items(), key=lambda x: x[1], reverse=True)[:50]:
        predicates_analysis.append({
            'label': pred_uri.split('/')[-1] if '/' in pred_uri else pred_uri.split('#')[-1] if '#' in pred_uri else pred_uri,
            'usage': count,
            'uri': pred_uri
        })
    
    analysis_results.update({
        'foundClassesCount': len(class_instances),
        'classList': class_analysis,
        'predicatesList': predicates_analysis
    })
    
    return analysis_results

def analyze_graph_via_sparql(graph_uri, sparql_endpoint, analysis_results):
    """Analyze a graph via SPARQL queries (for viewing existing graphs)"""
    try:
        # Count total triples in graph
        count_query = f"""
        SELECT (COUNT(*) as ?count)
        FROM <{graph_uri}>
        WHERE {{ ?s ?p ?o }}
        """
        
        count_result = query_sparql(count_query)
        if count_result and len(count_result) > 0:
            analysis_results['totalTriples'] = int(count_result[0]['count']['value'])
        
        # Get ALL distinct classes and their instance counts (no filtering)
        classes_query = f"""
        SELECT ?class (COUNT(?instance) as ?count)
        FROM <{graph_uri}>
        WHERE {{
          ?instance a ?class
        }}
        GROUP BY ?class
        ORDER BY DESC(?count)
        LIMIT 100
        """
        
        classes_result = query_sparql(classes_query)
        if classes_result and len(classes_result) > 0:
            class_analysis = []
            for binding in classes_result:
                class_uri = binding['class']['value']
                instance_count = int(binding['count']['value'])
                
                # Create readable label from URI
                class_label = class_uri.split('/')[-1] if '/' in class_uri else class_uri.split('#')[-1] if '#' in class_uri else class_uri
                
                class_analysis.append({
                    'label': class_label,
                    'instanceCount': instance_count,
                    'uri': class_uri
                })
            
            analysis_results['classList'] = class_analysis
            analysis_results['foundClassesCount'] = len(class_analysis)
        
        # Get distinct predicates and their usage counts
        predicates_query = f"""
        SELECT ?predicate (COUNT(*) as ?count)
        FROM <{graph_uri}>  
        WHERE {{
          ?s ?predicate ?o
          FILTER(?predicate != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>)
        }}
        GROUP BY ?predicate
        ORDER BY DESC(?count)
        LIMIT 50
        """
        
        predicates_result = query_sparql(predicates_query)
        if predicates_result and len(predicates_result) > 0:
            predicates_analysis = []
            for binding in predicates_result:
                pred_uri = binding['predicate']['value']
                usage_count = int(binding['count']['value'])
                
                pred_label = pred_uri.split('/')[-1] if '/' in pred_uri else pred_uri.split('#')[-1] if '#' in pred_uri else pred_uri
                
                predicates_analysis.append({
                    'label': pred_label,
                    'usage': usage_count,
                    'uri': pred_uri
                })
            
            analysis_results['predicatesList'] = predicates_analysis
            
        return analysis_results
        
    except Exception as e:
        print(f"Error in SPARQL analysis: {e}")
        analysis_results['error'] = str(e)
        return analysis_results

@app.route('/api/graphs/<graph_name>/analysis', methods=['GET'])
def get_graph_analysis(graph_name):
    """Get analysis for a specific named graph"""
    try:
        graph_uri = config.get_graph_uri(graph_name)
        sparql_endpoint = f"{config.virtuoso_url}/sparql"
        
        # Use the unified analysis function
        analysis_data = create_graph_analysis_data(
            graph_uri=graph_uri,
            graph_name=graph_name,
            sparql_endpoint=sparql_endpoint
        )
        
        # Create tabs using the unified function
        tabs = create_analysis_tabs(
            analysis_data=analysis_data,
            graph_name=graph_name,
            graph_uri=graph_uri,
            sparql_endpoint=sparql_endpoint
        )
        
        return jsonify({
            'success': True,
            'graphName': graph_name,
            'graphUri': graph_uri,
            'tabs': tabs,
            'analysis': analysis_data
        })
        
    except Exception as e:
        print(f"Error analyzing graph {graph_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/graphs/<graph_name>/class/<path:class_uri>/instances', methods=['GET'])
def get_class_instances_paginated(graph_name, class_uri):
    """Get paginated instances for a specific class with filtering support"""
    try:
        # Get query parameters
        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('pageSize', 25, type=int)
        filter_text = request.args.get('filter', '', type=str)
        
        # Validate parameters
        if page < 1:
            page = 1
        if page_size < 1 or page_size > 1000:  # Limit max page size
            page_size = 25
            
        # Calculate OFFSET for SPARQL
        offset = (page - 1) * page_size
        
        graph_uri = config.get_graph_uri(graph_name)
        
        # Build filter condition for SPARQL
        filter_condition = ""
        if filter_text.strip():
            escaped_filter = filter_text.replace("'", "\\'").replace("\\", "\\\\")
            filter_condition = f"""
            FILTER(
                CONTAINS(LCASE(COALESCE(?label, "")), LCASE('{escaped_filter}')) ||
                CONTAINS(LCASE(STR(?instance)), LCASE('{escaped_filter}'))
            )
            """
        
        # Query with pagination and filtering
        instances_query = f"""
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
          {filter_condition}
        }}
        ORDER BY COALESCE(?label, STR(?instance)) ?instance
        LIMIT {page_size}
        OFFSET {offset}
        """
        
        # Get total count for pagination
        count_query = f"""
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
          {filter_condition}
        }}
        """
        
        # Execute queries
        instances_result = query_sparql(instances_query)
        count_result = query_sparql(count_query)
        
        # Process count
        total_count = 0
        if count_result and len(count_result) > 0:
            total_count = int(count_result[0]['count']['value'])
        
        # Process instances
        instance_data = []
        if instances_result:
            for binding in instances_result:
                instance_uri = binding['instance']['value']
                
                # Get label or create one from URI
                label = None
                if 'label' in binding and binding['label']:
                    label = binding['label']['value']
                
                if not label:
                    if '#' in instance_uri:
                        label = instance_uri.split('#')[-1]
                    elif '/' in instance_uri:
                        label = instance_uri.split('/')[-1]
                    else:
                        label = instance_uri
                        
                instance_data.append({
                    'label': label,
                    'uri': instance_uri
                })
        
        # Calculate pagination metadata
        total_pages = math.ceil(total_count / page_size) if total_count > 0 else 1
        has_next = page < total_pages
        has_previous = page > 1
        
        return jsonify({
            'success': True,
            'data': instance_data,
            'pagination': {
                'page': page,
                'pageSize': page_size,
                'totalItems': total_count,
                'totalPages': total_pages,
                'hasNext': has_next,
                'hasPrevious': has_previous
            },
            'filter': filter_text
        })
        
    except Exception as e:
        print(f"Error getting paginated instances for class {class_uri} in graph {graph_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)