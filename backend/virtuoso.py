import os
import requests
from requests.auth import HTTPDigestAuth
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import time

VIRTUOSO_URL = os.getenv('VIRTUOSO_URL', 'http://localhost:8890')  # Keep for Virtuoso endpoint
SPARQL_ENDPOINT = f"{VIRTUOSO_URL}/sparql"

endpoint = f"{VIRTUOSO_URL}/sparql-graph-crud-auth"
username = 'dba'
password = 'dba'
retry=5

# Create a session with connection pooling and retry strategy
session = requests.Session()
retry_strategy = Retry(
    total=3,
    backoff_factor=1,
    status_forcelist=[429, 500, 502, 503, 504],
)
adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=10, pool_maxsize=20)
session.mount("http://", adapter)
session.mount("https://", adapter)

def storeDataToGraph(graph, data, timeout_seconds=300):
	"""Store serialized RDF data to Virtuoso under the given graph name.

	Args:
		graph: Graph URI to store data in
		data: Serialized RDF data (Turtle format)
		timeout_seconds: Request timeout in seconds (default 300 = 5 minutes)

	Returns True on success (HTTP 200/201), False on failure.
	"""

	if not graph:
		raise ValueError("No graph specified for virtuoso storage")

	api_url = endpoint + '?graph=' + graph
	headers = {'Content-type': 'text/turtle'}
	response = None
	
	print(f"Uploading data to Virtuoso graph: {graph} (timeout: {timeout_seconds}s)")
	
	for i in range(retry):
		try:
			response = session.post(api_url, data=data, headers=headers, 
								   auth=HTTPDigestAuth(username, password), 
								   timeout=timeout_seconds)
			break
		except requests.exceptions.Timeout:
			print(f"Upload attempt {i+1} timed out after {timeout_seconds} seconds")
			if i < retry - 1:
				print("Retrying...")
				time.sleep(5)
		except Exception as e:
			print(f"Upload attempt {i+1} failed: {str(e)}")
			if i < retry - 1:
				time.sleep(2)

	if response is None:
		print("Error: No Response from Server", flush=True)
		return False

	if response.status_code in (200, 201):
		print(f"Successfully uploaded data to graph: {graph}")
		return True
	else:
		print(f"Error: Status Code: {response.status_code}", flush=True)
		print(response.text, flush=True)
		return False

def storeDataToGraphInBatches(graph, rdf_graph, batch_size=10000, progress_callback=None):
	"""Store large RDF graph data to Virtuoso in smaller batches.

	Args:
		graph: Graph URI to store data in
		rdf_graph: rdflib.Graph object containing the data
		batch_size: Number of triples per batch (default 10000)
		progress_callback: Optional callback function (batch_num, processed_triples, total_triples)

	Returns True on success, False on failure.
	"""
	if not graph:
		raise ValueError("No graph specified for virtuoso storage")
	
	total_triples = len(rdf_graph)
	print(f"Uploading {total_triples} triples in batches of {batch_size}...")
	
	if total_triples <= batch_size:
		# Small enough to upload in one go
		print("File small enough for single upload")
		data = rdf_graph.serialize(format='turtle')
		success = storeDataToGraph(graph, data)
		if success and progress_callback:
			progress_callback(1, total_triples, total_triples)
		return success
	
	# Split into batches - process iteratively to reduce memory usage
	total_batches = (total_triples + batch_size - 1) // batch_size
	print(f"Splitting into {total_batches} batches...")
	
	processed_triples = 0
	triples_iter = iter(rdf_graph)
	
	for batch_num in range(total_batches):
		print(f"Uploading batch {batch_num+1}/{total_batches}...")
		
		# Create a new graph for this batch
		from rdflib import Graph
		batch_graph = Graph()
		
		# Add triples to batch graph (up to batch_size)
		batch_triples_count = 0
		try:
			while batch_triples_count < batch_size:
				triple = next(triples_iter)
				batch_graph.add(triple)
				batch_triples_count += 1
		except StopIteration:
			# End of triples reached
			pass
		
		if batch_triples_count == 0:
			break  # No more triples to process
		
		print(f"Batch {batch_num+1} contains {batch_triples_count} triples")
		
		# Serialize and upload
		batch_data = batch_graph.serialize(format='turtle')
		success = storeDataToGraph(graph, batch_data, timeout_seconds=10)
		
		if not success:
			print(f"Failed to upload batch {batch_num+1}")
			return False
		
		processed_triples += batch_triples_count
		print(f"Batch {batch_num+1}/{total_batches} uploaded successfully")
		
		# Update progress
		if progress_callback:
			progress_callback(batch_num + 1, processed_triples, total_triples)
		
		# Small delay between batches to avoid overwhelming the server
		if batch_num < total_batches - 1:  # Don't sleep after the last batch
			time.sleep(1)
	
	print(f"All {total_batches} batches uploaded successfully!")
	return True

def query_sparql(query_string, timeout_seconds=30):
	"""Execute SPARQL query against Virtuoso endpoint.
	
	Args:
		query_string: SPARQL query to execute
		timeout_seconds: Request timeout in seconds
	
	Returns:
		List of result bindings or None on failure
	"""
	
	try:
		headers = {
			'Accept': 'application/sparql-results+json',
			'Content-Type': 'application/x-www-form-urlencoded'
		}
		
		data = {'query': query_string}
		
		response = session.post(SPARQL_ENDPOINT, 
							   data=data, 
							   headers=headers,
							   timeout=timeout_seconds)
		
		if response.status_code == 200:
			result_data = response.json()
			if 'results' in result_data and 'bindings' in result_data['results']:
				return result_data['results']['bindings']
			else:
				print(f"Unexpected SPARQL response format: {result_data}")
				return []
		else:
			print(f"SPARQL query failed with status {response.status_code}: {response.text}")
			return None
			
	except Exception as e:
		print(f"Error executing SPARQL query: {e}")
		return None