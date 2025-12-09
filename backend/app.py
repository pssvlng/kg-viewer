from flask import Flask, request, jsonify
from flask_cors import CORS
from rdflib import Graph, RDF, RDFS
import os
import json
import uuid
import threading
import time
from datetime import datetime
from dataclasses import dataclass, asdict
from typing import Dict, Optional, List
from virtuoso import storeDataToGraph, storeDataToGraphInBatches, query_sparql

app = Flask(__name__)
CORS(app)

# Configure maximum upload size (1GB)
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024  # 1GB in bytes

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
    
    print(f"Loaded {len(CLASS_DEFINITIONS)} class definitions")
    print(f"Created URI mapping for {len(URI_TO_CLASS)} classes")
else:
    print("Warning: class_definitions.json not found")

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

# Virtuoso configuration
VIRTUOSO_URL = os.getenv('VIRTUOSO_URL', 'http://localhost:8890')
SPARQL_ENDPOINT = f"{VIRTUOSO_URL}/sparql"

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "Knowledge Graph Viewer Backend",
        "virtuoso_url": VIRTUOSO_URL,
        "sparql_endpoint": SPARQL_ENDPOINT
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
        graph_uri = f"http://localhost:8080/graph/{graph_name}"
        
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
        
        graph_uri = f"http://localhost:8080/graph/{graph_name}"
        
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
                'sparqlEndpoint': SPARQL_ENDPOINT
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
            graph_uri = "http://localhost:8080/graph/default"
        else:
            graph_uri = f"http://localhost:8080/graph/{graph_name}"
        
        sparql_endpoint = "http://localhost:8890/sparql"
        
        # Progress callback function
        def progress_callback(batch_num, processed_triples, total_triples):
            update_job_progress(job_id, batch_num, processed_triples)
        
        print(f"Starting batch upload for job {job_id}")
        
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
        
        print(f"Upload completed for job {job_id}, analyzing data...")
        
        # Analyze the uploaded data with progress tracking
        result_data = analyze_uploaded_data_optimized(graph, graph_name, graph_uri, sparql_endpoint, job_id)
        
        # Mark job as completed
        complete_job(job_id, result_data)
        
        print(f"Job {job_id} completed successfully")
        
    except Exception as e:
        print(f"Error processing job {job_id}: {str(e)}")
        fail_job(job_id, str(e))

def analyze_uploaded_data_optimized(graph, graph_name, graph_uri, sparql_endpoint, job_id):
    """Analyze the uploaded TTL data efficiently for large files"""
    tabs = []
    total_triples = len(graph)
    
    print(f"Starting optimized analysis for {total_triples} triples...")
    
    # Create structured upload info for better formatting in frontend
    upload_info = {
        'status': 'Success',
        'message': 'TTL file uploaded and stored successfully',
        'graphName': graph_name or 'default',
        'graphId': graph_name or 'default',
        'graphUri': graph_uri,
        'triplesCount': total_triples,
        'sparqlEndpoint': sparql_endpoint
    }
    
    # Find all subjects that are instances of known classes
    class_instances = {}
    all_classes_found = set()
    
    # Use RDFLib's efficient querying instead of iterating all triples
    print("Extracting type assertions using chunked SPARQL queries...")
    
    type_triples = []
    
    try:
        # Query for all type assertions
        for subj, pred, obj in graph.triples((None, RDF.type, None)):
            type_triples.append((str(subj), str(obj)))
            all_classes_found.add(str(obj))
        
        print(f"Found {len(type_triples)} type assertions")
        print(f"Found {len(all_classes_found)} distinct classes")
        
        update_analysis_progress(job_id, 40, "Analyzing class instances...")
        
        # Group instances by known classes
        for subj_uri, class_uri in type_triples:
            if class_uri in URI_TO_CLASS:
                if class_uri not in class_instances:
                    class_instances[class_uri] = []
                class_instances[class_uri].append(subj_uri)
        
        print(f"Found {len(class_instances)} known classes with instances")
        
        update_analysis_progress(job_id, 80, "Preparing results...")
        
        # Prepare structured analysis data
        class_analysis = []
        for class_uri, instances in class_instances.items():
            class_info = URI_TO_CLASS.get(class_uri, {})
            class_label = class_info.get('label_en', class_info.get('display_label', class_uri.split('/')[-1]))
            class_analysis.append({
                'label': class_label,
                'instanceCount': len(instances),
                'uri': class_uri
            })
        
        # Sort by instance count (descending)
        class_analysis.sort(key=lambda x: x['instanceCount'], reverse=True)
        
        # Create analysis summary for upload info
        upload_info['analysisResults'] = {
            'totalTriples': total_triples,
            'classDefinitionsLoaded': len(CLASS_DEFINITIONS),
            'foundClassesCount': len(class_instances),
            'classList': class_analysis[:20]  # Top 20 classes
        }
        
        update_analysis_progress(job_id, 90, "Creating result tabs...")
        
        # Create Summary tab
        summary_content = f"""Upload Summary:
• Total Triples: {total_triples:,}
• Graph URI: {graph_uri}
• Classes Found: {len(all_classes_found)}
• Known Classes: {len(class_instances)}
• Class Definitions Loaded: {len(CLASS_DEFINITIONS)}

Analysis completed successfully."""
        
        tabs.append({
            'label': 'Summary',
            'content': summary_content,
            'type': 'summary',
            'uploadInfo': upload_info
        })
        
        # Create Classes Overview tab
        if class_analysis:
            tabs.append({
                'label': 'Classes Overview',
                'content': 'Overview of RDF classes found in the uploaded data',
                'type': 'table',
                'data': class_analysis,
                'uploadInfo': upload_info
            })
        
        # Create detailed tabs for each class with many instances
        update_analysis_progress(job_id, 95, "Creating detailed class views...")
        
        for class_uri, instances in list(class_instances.items())[:10]:  # Top 10 classes
            if len(instances) > 5:  # Only create tabs for classes with multiple instances
                class_info = URI_TO_CLASS.get(class_uri, {})
                class_label = class_info.get('label_en', class_info.get('display_label', class_uri.split('/')[-1]))
                
                # Get sample instances with their properties
                sample_instances = instances[:100]  # Limit to first 100 instances
                instance_data = []
                
                for instance_uri in sample_instances:
                    instance_info = {'uri': instance_uri}
                    
                    # Get properties for this instance
                    for pred, obj in graph.predicate_objects(subj=None):  # This should be the instance URI
                        if str(pred) != str(RDF.type):
                            pred_label = str(pred).split('/')[-1]
                            instance_info[pred_label] = str(obj)
                    
                    instance_data.append(instance_info)
                
                tabs.append({
                    'label': f'{class_label} ({len(instances)})',
                    'content': f'Instances of {class_label}',
                    'type': 'table',
                    'data': instance_data,
                    'uploadInfo': upload_info
                })
        
        update_analysis_progress(job_id, 100, "Analysis completed")
        
        print(f"Analysis completed successfully with {len(tabs)} tabs")
        return tabs
        
    except Exception as e:
        print(f"Error during analysis: {e}")
        # Return minimal result on error
        return [{
            'label': 'Summary',
            'content': f'Upload completed with {total_triples} triples.\nAnalysis failed: {str(e)}',
            'type': 'summary',
            'uploadInfo': upload_info
        }]

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
        print(f"Received file: {file.filename} with {total_triples} triples for graph: {graph_name or 'default'}")
        
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
        print(f"Error starting upload job: {e}")
        return jsonify({"error": f"Failed to start upload: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)