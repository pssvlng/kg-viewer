// Frontend configuration that can be injected at build time or runtime
window.APP_CONFIG = window.APP_CONFIG || {
  API_BASE_URL: 'http://localhost:5000',
  LODVIEW_URL: 'http://localhost:8080',
  VIRTUOSO_URL: 'http://localhost:8890',
  GRAPH_BASE_URI: 'http://localhost:8890/graph',
  SPARQL_ENDPOINT: 'http://localhost:8890/sparql'
};

// Configuration service for the frontend
class ConfigService {
  constructor() {
    this.config = null;
    this.loaded = false;
  }

  async loadConfig() {
    if (this.loaded) {
      return this.config;
    }

    try {
      // Try to fetch config from backend
      const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/api/config`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          this.config = {
            apiBaseUrl: data.config.external_backend_url,
            lodviewUrl: data.config.external_lodview_url,
            virtuosoUrl: data.config.external_virtuoso_url,
            graphBaseUri: data.config.graph_base_uri,
            sparqlEndpoint: data.config.sparql_endpoint,
            defaultGraphName: data.config.default_graph_name
          };
          this.loaded = true;
          return this.config;
        }
      }
    } catch (error) {
      console.warn('Failed to load config from backend, using defaults:', error);
    }

    // Fallback to environment/default config
    this.config = {
      apiBaseUrl: window.APP_CONFIG.API_BASE_URL,
      lodviewUrl: window.APP_CONFIG.LODVIEW_URL,
      virtuosoUrl: window.APP_CONFIG.VIRTUOSO_URL,
      graphBaseUri: window.APP_CONFIG.GRAPH_BASE_URI,
      sparqlEndpoint: window.APP_CONFIG.SPARQL_ENDPOINT,
      defaultGraphName: 'default'
    };
    this.loaded = true;
    return this.config;
  }

  getConfig() {
    return this.config;
  }

  getApiUrl(path = '') {
    const config = this.getConfig();
    if (!config) return `${window.APP_CONFIG.API_BASE_URL}${path}`;
    return `${config.apiBaseUrl}${path}`;
  }

  getLodviewUrl(path = '') {
    const config = this.getConfig();
    if (!config) return `${window.APP_CONFIG.LODVIEW_URL}${path}`;
    return `${config.lodviewUrl}${path}`;
  }

  getGraphUri(graphName) {
    const config = this.getConfig();
    if (!config) return `${window.APP_CONFIG.GRAPH_BASE_URI}/${graphName}`;
    return `${config.graphBaseUri}/${graphName}`;
  }

  getSparqlEndpoint() {
    const config = this.getConfig();
    if (!config) return window.APP_CONFIG.SPARQL_ENDPOINT;
    return config.sparqlEndpoint;
  }
}

// Global config service instance
window.configService = new ConfigService();