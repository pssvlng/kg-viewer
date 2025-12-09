# Knowledge Graph Viewer

A web application for uploading, analyzing, and visualizing TTL (Turtle) format RDF data in knowledge graphs. The application provides comprehensive analysis of semantic data including class instances, relationships, and detailed tabular views with optional named graph support.

## Architecture

The application consists of four main components:
- **Backend**: Flask-based API server for data processing and analysis
- **Frontend**: Angular-based web interface for user interaction
- **Virtuoso**: RDF triple store database with SPARQL endpoint
- **LODView**: Linked data browser for exploring RDF resources

## Quick Start with Docker

The easiest way to run the entire system is using Docker Compose:

```bash
# Start all services in the background
docker-compose up -d

# View logs (optional)
docker-compose logs -f

# Stop all services
docker-compose down
```

This will start:
- **Frontend** on `http://localhost:4200`
- **Backend** on `http://localhost:5000`
- **Virtuoso** on `http://localhost:8890`
- **LODView** on `http://localhost:8080`

Once all containers are running, open your browser to `http://localhost:4200` to use the application.

### Docker Services

- `frontend`: Angular application served via nginx
- `backend`: Flask API server
- `virtuoso`: RDF triple store database
- `lodview`: Linked data browser for RDF exploration

## Features

### TTL File Upload
- Upload TTL files containing RDF data
- Optional named graph specification
- Automatic file validation and parsing
- Background processing with progress tracking

### Named Graph Support
- Default graph: Data stored in `http://localhost:8080/graph/default`
- Custom graphs: Data stored in `http://localhost:8080/graph/{custom-name}`
- Graph selection affects data isolation and querying

### Data Analysis
- Automatic RDF class detection using common vocabularies
- Instance counting and classification
- Relationship analysis between entities
- SPARQL query generation for data exploration

### Visualization & Export
- Tabular views with filtering and sorting
- Interactive data tables with pagination
- Export functionality for analysis results
- Direct SPARQL endpoint access

## Development Mode

For development and debugging purposes, you can run the services individually outside of Docker.

### Prerequisites

- Python 3.9+
- Node.js 18+
- pip or uv (Python package manager)
- npm (Node package manager)
- Virtuoso Universal Server (for RDF data storage)

### Backend Development

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run development server
python app.py
```

The backend will be available at `http://localhost:5000`

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Run development server
ng serve
```

The frontend will be available at `http://localhost:4200`

## API Endpoints

### Backend API (`http://localhost:5000`)

- `GET /health` - Health check endpoint
- `POST /upload_file` - Upload and process TTL files
- `GET /upload/status/<job_id>` - Get job processing status
- `GET /upload/jobs` - List all jobs (debugging)

### Example API Usage

```bash
# Check backend health
curl http://localhost:5000/health

# Upload a file with custom graph name
curl -X POST \
  -F "file=@data.ttl" \
  -F "graphName=my-custom-graph" \
  http://localhost:5000/upload_file

# Upload a file to default graph (leave graphName empty)
curl -X POST \
  -F "file=@data.ttl" \
  -F "graphName=" \
  http://localhost:5000/upload_file

# Check job status
curl http://localhost:5000/upload/status/<job_id>
```

### SPARQL Endpoint

Access the Virtuoso SPARQL endpoint at `http://localhost:8890/sparql` for direct querying:

```sparql
# Query default graph
SELECT * FROM <http://localhost:8080/graph/default>
WHERE {
  ?s ?p ?o
}
LIMIT 100

# Query custom named graph
SELECT * FROM <http://localhost:8080/graph/my-custom-graph>
WHERE {
  ?s ?p ?o
}
LIMIT 100
```

## Configuration

### Environment Variables

- `VIRTUOSO_URL`: Virtuoso server URL (default: `http://localhost:8890`)
- `FLASK_ENV`: Flask environment (default: `production`)

### Graph URI Pattern

- Default graph: `http://localhost:8080/graph/default`
- Custom graph: `http://localhost:8080/graph/{graph-name}`

## Supported RDF Vocabularies

The application includes definitions for common RDF vocabularies:

- **RDF/RDFS**: Core RDF and RDF Schema terms
- **OWL**: Web Ontology Language terms  
- **FOAF**: Friend of a Friend vocabulary
- **Dublin Core Terms**: Metadata vocabulary
- **SKOS**: Simple Knowledge Organization System

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 4200, 5000, 8080, and 8890 are available
2. **Memory issues**: Large TTL files are processed in batches to manage memory
3. **Upload timeouts**: Files are processed asynchronously with progress tracking
4. **SPARQL access**: Virtuoso may take time to start - wait for health checks

### Logs

```bash
# View all service logs
docker-compose logs

# View specific service logs
docker-compose logs backend
docker-compose logs frontend
docker-compose logs virtuoso
docker-compose logs lodview
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.