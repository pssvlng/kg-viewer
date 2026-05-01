from flask import Flask
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import os
import json
import sys

# Import application routes
sys.path.append('./src')
from src.api_routes import register_api_routes
from config import config

app = Flask(__name__)

# Open CORS — the nginx reverse proxy is the security boundary in production
CORS(app)

# Rate limiting — backed by in-process memory
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["300 per minute"],
    storage_uri="memory://",
)

# Configure maximum upload size from config
app.config['MAX_CONTENT_LENGTH'] = config.max_content_length

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

# Register API routes
register_api_routes(app)

if __name__ == '__main__':
    print("🚀 Starting Knowledge Graph Viewer")
    print("📊 Available endpoints:")
    print("   • GET  /api/health - System health check")
    print("   • GET  /api/config - Frontend configuration")
    print("   • POST /api/upload - File upload")
    print("   • GET  /api/upload/status/<job_id> - Job status")
    print("   • GET  /api/graphs - Available graphs")
    
    app.run(host=config.flask_host, port=config.flask_port, debug=config.flask_debug)