# Configuration Management

This application uses environment-based configuration management for different deployment scenarios.

## Quick Start

### Development
```bash
./scripts/dev.sh
```

### Production
```bash
./scripts/prod.sh
```

## Environment Files

- `config/.env.development` - Development configuration
- `config/.env.production` - Production configuration  
- `config/.env.example` - Template for creating new environments

## Configuration Variables

### External URLs (Browser Access)
- `EXTERNAL_FRONTEND_URL` - Frontend URL for browser access
- `EXTERNAL_BACKEND_URL` - Backend API URL for browser access
- `EXTERNAL_VIRTUOSO_URL` - Virtuoso SPARQL endpoint URL for browser access
- `EXTERNAL_LODVIEW_URL` - LODView URL for browser access

### Internal URLs (Container-to-Container)
- `VIRTUOSO_URL` - Internal Virtuoso service URL
- `LODVIEW_URL` - Internal LODView service URL

### Graph Configuration
- `GRAPH_BASE_URI` - Base URI for RDF graphs
- `DEFAULT_GRAPH_NAME` - Default graph name

### Ports (Development Only)
- `FRONTEND_PORT` - Frontend service port
- `BACKEND_PORT` - Backend service port
- `VIRTUOSO_HTTP_PORT` - Virtuoso HTTP port
- `VIRTUOSO_SQL_PORT` - Virtuoso SQL port
- `LODVIEW_PORT` - LODView port

### Security
- `DBA_PASSWORD` - Virtuoso DBA password
- `FLASK_DEBUG` - Flask debug mode
- `FLASK_ENV` - Flask environment
- `MAX_CONTENT_LENGTH` - Maximum upload size in bytes

## Deployment Scenarios

### Development
Uses direct port mappings for easy development. Access services directly:
- Frontend: http://localhost:4200
- Backend API: http://localhost:5000
- Virtuoso: http://localhost:8890
- LODView: http://localhost:8080

### Production
Uses reverse proxy (Nginx) for all services through port 80:
- All services: https://yourdomain.com
- Backend API: https://yourdomain.com/api
- Virtuoso: https://yourdomain.com/virtuoso
- LODView: https://yourdomain.com/lodview

## Configuration API

The backend exposes a configuration endpoint at `/api/config` that provides frontend-safe configuration values.

## Customization

1. Copy `config/.env.example` to create a new environment file
2. Update the values for your specific deployment
3. Use the appropriate script to deploy with your configuration

## Security Notes

- Never commit actual credentials to version control
- Use environment-specific secret management in production
- Set strong passwords for database access
- Configure proper CORS policies for production domains