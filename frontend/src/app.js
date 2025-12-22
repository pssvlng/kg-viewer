console.log('Frontend JavaScript loaded successfully - VERSION: 20250101_CONFIG_MGMT');
console.log('Added configuration management and removed hardcoded URLs');

// Global variables
let currentJobId = null;
let pollInterval = null;
let currentGraphsPage = 1;
const graphsPerPage = 10;
let allGraphs = [];
let filteredGraphs = [];
let appConfig = null;

// Toast notification system
function showToast(message, type = 'success', duration = 4000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 100);
  
  // Auto-remove toast
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => container.removeChild(toast), 300);
  }, duration);
}

function showSuccessToast(message) {
  showToast(message, 'success');
}

function showErrorToast(message) {
  showToast(message, 'error');
}

function showWarningToast(message) {
  showToast(message, 'warning');
}

function showInfoToast(message) {
  showToast(message, 'info');
}

// Main tab switching functionality
function switchMainTab(tabName) {
  // Remove active class from all main tabs
  document.querySelectorAll('.main-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Hide all main tab contents
  document.querySelectorAll('.main-tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // Show selected tab content
  document.getElementById(`${tabName}-content`).classList.add('active');
  
  // Add active class to selected tab
  document.querySelector(`.main-tab[onclick*="${tabName}"]`).classList.add('active');
  
  // Load graphs if switching to view-edit tab
  if (tabName === 'view-edit') {
    // Wait a bit to ensure configuration is loaded
    setTimeout(loadGraphsList, 100);
  }
}

// Make critical functions available globally immediately for onclick handlers
window.switchMainTab = switchMainTab;

// Named graphs management functionality
async function loadGraphsList() {
  const container = document.getElementById('graphsTableContainer');
  container.innerHTML = '<div class="loading">Loading graphs...</div>';
  
  try {
    // Ensure configuration service is available
    if (!window.configService) {
      throw new Error('Configuration service not available');
    }
    
    const response = await fetch(window.configService.getApiUrl('/api/graphs'));
    const data = await response.json();
    
    console.log('Graphs API response:', data);
    
    if (response.ok) {
      allGraphs = data.graphs || [];
      filteredGraphs = [...allGraphs];
      renderGraphsTable();
    } else {
      container.innerHTML = `<div class="error">Error loading graphs: ${data.error || 'Unknown error'}</div>`;
    }
  } catch (error) {
    console.error('Error loading graphs:', error);
    showErrorToast(`Failed to load graphs: ${error.message}`);
    container.innerHTML = `<div class="error">Error loading graphs: ${error.message}</div>`;
  }
}

function filterGraphs() {
  const searchTerm = document.getElementById('graphsFilter').value.toLowerCase();
  filteredGraphs = allGraphs.filter(graph => 
    graph.name.toLowerCase().includes(searchTerm)
  );
  currentGraphsPage = 1;
  renderGraphsTable();
}

function renderGraphsTable() {
  const container = document.getElementById('graphsTableContainer');
  const startIndex = (currentGraphsPage - 1) * graphsPerPage;
  const endIndex = startIndex + graphsPerPage;
  const pageGraphs = filteredGraphs.slice(startIndex, endIndex);
  
  if (filteredGraphs.length === 0) {
    container.innerHTML = '<div class="loading">No graphs found.</div>';
    document.getElementById('graphsPagination').style.display = 'none';
    return;
  }
  
  let html = `
    <table class="graphs-table">
      <thead>
        <tr>
          <th>Graph Name</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  pageGraphs.forEach(graph => {
    html += `
      <tr>
        <td><strong>${graph.name}</strong></td>
        <td>
          <button class="delete-btn" onclick="confirmDeleteGraph('${graph.name}')" title="Delete graph">
            <span class="material-icons">delete</span>
          </button>
        </td>
      </tr>
    `;
  });
  
  html += '</tbody></table>';
  container.innerHTML = html;
  
  // Update pagination
  renderGraphsPagination();
}

function renderGraphsPagination() {
  const paginationContainer = document.getElementById('graphsPagination');
  const totalPages = Math.ceil(filteredGraphs.length / graphsPerPage);
  
  if (totalPages <= 1) {
    paginationContainer.style.display = 'none';
    return;
  }
  
  paginationContainer.style.display = 'block';
  let html = '';
  
  // Previous button
  if (currentGraphsPage > 1) {
    html += `<button onclick="changeGraphsPage(${currentGraphsPage - 1})">← Previous</button>`;
  }
  
  // Page numbers
  for (let i = 1; i <= Math.min(totalPages, 10); i++) {
    const activeClass = i === currentGraphsPage ? 'active' : '';
    html += `<button class="${activeClass}" onclick="changeGraphsPage(${i})">${i}</button>`;
  }
  
  // Next button
  if (currentGraphsPage < totalPages) {
    html += `<button onclick="changeGraphsPage(${currentGraphsPage + 1})">Next →</button>`;
  }
  
  html += `<p style="margin-top: 10px;">Page ${currentGraphsPage} of ${totalPages} (${filteredGraphs.length} total graphs)</p>`;
  
  paginationContainer.innerHTML = html;
}

function changeGraphsPage(page) {
  currentGraphsPage = page;
  renderGraphsTable();
}

function refreshGraphsList() {
  loadGraphsList();
  showInfoToast('Graphs list refreshed');
}

function confirmDeleteGraph(graphName) {
  if (confirm(`Are you sure you want to delete the graph "${graphName}"? This action cannot be undone.`)) {
    deleteGraph(graphName);
  }
}

async function deleteGraph(graphName) {
  try {
    const response = await fetch(window.configService.getApiUrl(`/api/graphs/${encodeURIComponent(graphName)}`), {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showSuccessToast(`Graph "${graphName}" deleted successfully`);
      loadGraphsList(); // Refresh the list
    } else {
      showErrorToast(`Failed to delete graph: ${result.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Error deleting graph:', error);
    showErrorToast(`Error deleting graph: ${error.message}`);
  }
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', async function() {
  console.log('DOM loaded, initializing configuration...');
  
  // Initialize configuration
  try {
    appConfig = await window.configService.loadConfig();
    console.log('Configuration loaded:', appConfig);
  } catch (error) {
    console.error('Failed to load configuration:', error);
    appConfig = null;
  }
  
  console.log('Setting up event listeners...');
  
  document.getElementById('uploadForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const fileInput = document.getElementById('ttlFile');
    const graphName = document.getElementById('graphName').value.trim();
    const file = fileInput.files[0];
    
    if (!file) {
      showMessage('Please select a TTL file', 'error');
      return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('graphName', graphName);
    
    try {
      document.getElementById('uploadBtn').disabled = true;
      document.getElementById('progressSection').style.display = 'block';
      document.getElementById('message').innerHTML = '';
      
      const response = await fetch(window.configService.getApiUrl('/upload_file'), {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success && result.jobId) {
        currentJobId = result.jobId;
        showSuccessToast(`Upload started successfully! Tracking job: ${result.jobId}`);
        startPolling();
      } else {
        throw new Error(result.error || 'Upload failed');
      }
      
    } catch (error) {
      showMessage(`Error: ${error.message}`, 'error');
      showErrorToast(`Upload error: ${error.message}`);
      document.getElementById('uploadBtn').disabled = false;
      document.getElementById('progressSection').style.display = 'none';
    }
  });
  
  function startPolling() {
    pollInterval = setInterval(async () => {
      try {
        const response = await fetch(window.configService.getApiUrl(`/upload/status/${currentJobId}`));
        const job = await response.json();
        
        updateProgress(job.progress || 0);
        document.getElementById('progressText').textContent = 
          `${job.status} - ${job.processed_triples || 0} / ${job.total_triples || 0} triples (${job.progress?.toFixed(1) || 0}%)`;
        
        if (job.status === 'success') {
          clearInterval(pollInterval);
          showResults(job);
        } else if (job.status === 'failed') {
          clearInterval(pollInterval);
          showMessage(`Upload failed: ${job.error_message}`, 'error');
          showErrorToast(`Processing failed: ${job.error_message}`);
          document.getElementById('uploadBtn').disabled = false;
          document.getElementById('progressSection').style.display = 'none';
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000);
  }
  
  function updateProgress(percentage) {
    document.getElementById('progressFill').style.width = `${percentage}%`;
  }
  
  function showResults(job) {
    const progressSection = document.getElementById('progressSection');
    const resultsSection = document.getElementById('resultsSection');
    
    // Hide progress and show results
    progressSection.style.display = 'none';
    resultsSection.style.display = 'block';

    const graphName = job.graph_name || 'default';

    // Show entity statistics if available
    console.log('Job data:', job);
    console.log('EntityStats:', job.entityStats);

    if (job.entityStats && job.entityStats.entityTypes && job.entityStats.entityTypes.length > 0) {
      console.log('Found entity stats, showing tabs');
      showSuccessToast(`Upload completed! Found ${job.entityStats.totalTypes} entity types with ${job.entityStats.totalEntities} total entities.`);
      // Show tabs directly in resultsContent to bypass visibility issues
      showEntityTabsDirectly(job.entityStats.entityTypes, graphName, job);
    } else {
      console.log('No entity stats found or empty');
      showSuccessToast(`Upload completed! ${job.total_triples} triples processed.`);
      // Fallback: show basic results if no entity stats
      showBasicResults(graphName, job);
    }
  }
  
  function showBasicResults(graphName, job) {
    const graphUri = window.configService.getGraphUri(graphName);
    const sparqlQuery = `select * from <${graphUri}> where { ?s ?p ?o } LIMIT 100`;
    const sparqlUrl = `${window.configService.getSparqlEndpoint()}?qtxt=${encodeURIComponent(sparqlQuery)}`;

    const resultsHtml = `
      <p><strong>Graph Name:</strong> ${graphName}</p>
      <p><strong>Graph URI:</strong> <code>${graphUri}</code></p>
      <p><strong>Total Triples:</strong> ${job.total_triples}</p>
      <p><strong>SPARQL Endpoint:</strong> <a href="${sparqlUrl}" target="_blank" class="endpoint-link">Query Data</a></p>
      <p><strong>LODView Browser:</strong> <a href="${window.configService.getLodviewUrl()}" target="_blank" class="endpoint-link">Browse RDF Resources</a></p>
    `;

    document.getElementById('resultsContent').innerHTML = resultsHtml;
    // Hide entity tabs when showing basic results
    document.getElementById('entityTabs').style.display = 'none';
  }
  
  function showEntityTabsDirectly(entityTypes, graphName, job) {
    console.log('showEntityTabsDirectly called with:', entityTypes.length, 'types');
    console.log('Graph name:', graphName);
    console.log('Total triples:', job.total_triples);
    
    const graphUri = window.configService.getGraphUri(graphName);
    const sparqlQuery = `select * from <${graphUri}> where { ?s ?p ?o } LIMIT 100`;
    const sparqlUrl = `${window.configService.getSparqlEndpoint()}?qtxt=${encodeURIComponent(sparqlQuery)}`;
    
    // Create the complete tabs HTML directly
    let tabsHtml = `
      <h2>Knowledge Graph Analysis Results</h2>
      
      <div style="margin: 20px 0; padding: 20px; border: 1px solid #ccc; border-radius: 8px; background: white;">
        <div class="tabs-container" style="border-bottom: 2px solid #e0e0e0; margin-bottom: 20px; position: relative;">
          <div class="tabs" style="display: flex; overflow-x: auto; scrollbar-width: thin; scrollbar-color: #ccc transparent; white-space: nowrap; padding-bottom: 2px;">
            <button class="tab active" onclick="activateTabDirect('summary')" style="flex-shrink: 0; padding: 10px 20px; cursor: pointer; border: none; background: none; font-size: 14px; margin-right: 5px; border-bottom: 2px solid #1976d2; color: #1976d2; font-weight: bold;">Summary</button>`;
    
    // Add entity type tabs
    entityTypes.forEach(entityType => {
      tabsHtml += `<button class="tab" onclick="activateTabDirect('${encodeURIComponent(entityType.uri)}')" style="flex-shrink: 0; padding: 10px 20px; cursor: pointer; border: none; background: none; font-size: 14px; margin-right: 5px; border-bottom: 2px solid transparent; white-space: nowrap;">${entityType.name} (${entityType.count})</button>`;
    });
    
    tabsHtml += `
          </div>
        </div>
        
        <div id="tab-content-summary" class="tab-content" style="display: block;">
          <h3>Graph Information</h3>
          <p><strong>Graph Name:</strong> ${graphName}</p>
          <p><strong>Total Triples:</strong> ${job.total_triples}</p>
          <p><strong>SPARQL Endpoint:</strong> <a href="${sparqlUrl}" target="_blank" class="endpoint-link">Query Data</a></p>
          <p><strong>LODView Browser:</strong> <a href="${window.configService.getLodviewUrl()}" target="_blank" class="endpoint-link">Browse RDF Resources</a></p>
          
          <br>

          <h3>Entity Types Summary</h3>
          <p><strong>Total Entity Types:</strong> ${job.entityStats.totalTypes}</p>
          <p><strong>Total Entities:</strong> ${job.entityStats.totalEntities}</p>
          <table class="entity-table" style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <thead>
              <tr>
                <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0;">Entity Type</th>
                <th style="text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0;">Count</th>
              </tr>
            </thead>
            <tbody>`;
    
    entityTypes.forEach(entityType => {
      tabsHtml += `
        <tr style="cursor: pointer;" onclick="activateTabDirect('${encodeURIComponent(entityType.uri)}')" title="Click to view ${entityType.name} details">
          <td style="text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0;">
            <strong>${entityType.name}</strong>
            <div style="font-size: 12px; color: #666; font-family: monospace;">${entityType.uri}</div>
          </td>
          <td style="text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0;">${entityType.count.toLocaleString()}</td>
        </tr>`;
    });
    
    tabsHtml += `
            </tbody>
          </table>
        </div>`;
    
    // Add entity type content divs
    entityTypes.forEach(entityType => {
      tabsHtml += `
        <div id="tab-content-${encodeURIComponent(entityType.uri)}" class="tab-content" style="display: none;">
          <h3>${entityType.name} (${entityType.count} items)</h3>
          <div style="margin-bottom: 20px;">
            <input type="text" placeholder="Search ${entityType.name.toLowerCase()}..." onkeyup="filterEntities('${entityType.uri}')" id="filter-${encodeURIComponent(entityType.uri)}" style="width: 300px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          </div>
          <div id="entities-${encodeURIComponent(entityType.uri)}" class="loading">Loading entities...</div>
        </div>`;
    });
    
    tabsHtml += `</div>`;
    
    // Insert directly into resultsContent
    document.getElementById('resultsContent').innerHTML = tabsHtml;
    
    // Store for later use
    window.currentGraphName = graphName;
    window.entityTypes = entityTypes;
    
    console.log('Direct tabs HTML inserted into resultsContent');
  }
  
  function activateTabDirect(tabId) {
    console.log('Activating tab:', tabId);
    
    // Hide all tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.style.display = 'none';
    });
    
    // Remove active class from all tabs
    document.querySelectorAll('.tab').forEach(tab => {
      tab.style.borderBottomColor = 'transparent';
      tab.style.color = 'inherit';
      tab.style.fontWeight = 'normal';
    });
    
    // Show selected content
    const contentId = tabId === 'summary' ? 'tab-content-summary' : `tab-content-${tabId}`;
    const content = document.getElementById(contentId);
    if (content) {
      content.style.display = 'block';
      
      // Load entity data if not summary and not already loaded
      if (tabId !== 'summary' && content.querySelector('.loading')) {
        // Decode the URI since tabId is encoded
        const decodedUri = decodeURIComponent(tabId);
        console.log('Loading entities for decoded URI:', decodedUri);
        loadEntitiesByType(decodedUri, 1);
      }
    }
    
    // Activate selected tab
    const activeTab = document.querySelector(`[onclick="activateTabDirect('${tabId}')"]`);
    if (activeTab) {
      activeTab.style.borderBottomColor = '#1976d2';
      activeTab.style.color = '#1976d2';
      activeTab.style.fontWeight = 'bold';
    }
  }
  
  function showEntityTabs(entityTypes, graphName, job) {
    console.log('OLD showEntityTabs called - redirecting to showEntityTabsDirectly');
    showEntityTabsDirectly(entityTypes, graphName, job);
  }

  function activateTab(tabId) {
    // Remove active class from all tabs and contents
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });

    // Add active class to selected tab by data attribute
    const selectedTab = document.querySelector(`[data-tab-id="${tabId}"]`);
    if (selectedTab) {
      selectedTab.classList.add('active');
    }

    // Show selected content
    const contentId = tabId === 'summary' ? 'summary-content' : `tab-content-${encodeURIComponent(tabId)}`;
    const selectedContent = document.getElementById(contentId);
    if (selectedContent) {
      selectedContent.classList.add('active');

      // Load entity data if not summary and not already loaded
      if (tabId !== 'summary' && selectedContent.querySelector('.loading')) {
        loadEntitiesByType(tabId, 1);
      }
    }
  }  function getEntityNameFromUri(uri) {
    const entityType = window.entityTypes?.find(et => et.uri === uri);
    return entityType ? entityType.name : uri.split('/').pop() || uri.split('#').pop();
  }
  
  async function loadEntitiesByType(typeUri, page = 1) {
    const containerId = `entities-${encodeURIComponent(typeUri)}`;
    const container = document.getElementById(containerId);
    
    console.log('Loading entities for type:', typeUri);
    console.log('Current graph name:', window.currentGraphName);
    
    try {
      const searchFilter = document.getElementById(`filter-${encodeURIComponent(typeUri)}`)?.value || '';
      const url = window.configService.getApiUrl(`/api/entities/${window.currentGraphName}?type=${encodeURIComponent(typeUri)}&page=${page}&limit=20&search=${encodeURIComponent(searchFilter)}`);
      
      console.log('Fetching URL:', url);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('API response:', response.status, data);
      
      if (response.ok && data.entities) {
        console.log('Found', data.entities.length, 'entities');
        renderEntitiesTable(data, containerId, typeUri);
      } else {
        console.error('API error:', data.error || 'Unknown error');
        container.innerHTML = `<div class="error">Error loading entities: ${data.error || 'Unknown error'}</div>`;
      }
    } catch (error) {
      console.error('Fetch error:', error);
      showErrorToast(`Failed to load entities: ${error.message}`);
      container.innerHTML = `<div class="error">Error loading entities: ${error.message}</div>`;
    }
  }
  
  function renderEntitiesTable(data, containerId, typeUri) {
    const container = document.getElementById(containerId);
    
    let html = '<div class="entity-table-container"><table class="entity-table"><thead><tr><th>Label</th><th>URI</th></tr></thead><tbody>';
    
    data.entities.forEach(entity => {
        
      html += `
        <tr>
          <td><strong>${entity.label}</strong></td>
          <td><div class="entity-uri" title="${entity.uri}"><a href="${entity.uri}" target="_blank">${entity.uri}</a></div></td>
        </tr>
      `;
    });
    
    html += '</tbody></table></div>';
    
    // Add pagination
    if (data.pagination.pages > 1) {
      html += '<div class="pagination">';
      
      // Previous button
      if (data.pagination.page > 1) {
        html += `<button onclick="loadEntitiesByType('${typeUri}', ${data.pagination.page - 1})">← Previous</button>`;
      }
      
      // Page numbers
      for (let i = 1; i <= Math.min(data.pagination.pages, 10); i++) {
        const activeClass = i === data.pagination.page ? 'active' : '';
        html += `<button class="${activeClass}" onclick="loadEntitiesByType('${typeUri}', ${i})">${i}</button>`;
      }
      
      // Next button
      if (data.pagination.page < data.pagination.pages) {
        html += `<button onclick="loadEntitiesByType('${typeUri}', ${data.pagination.page + 1})">Next →</button>`;
      }
      
      html += `</div><p style="text-align: center; margin-top: 10px;">Page ${data.pagination.page} of ${data.pagination.pages} (${data.pagination.total} total items)</p>`;
    }
    
    container.innerHTML = html;
  }
  
  function filterEntities(typeUri) {
    // Debounce the search to avoid too many requests
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
      loadEntitiesByType(typeUri, 1);
    }, 500);
  }
  
  function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.innerHTML = `<div class="message ${type}">${text}</div>`;
  }
  
  function resetForm() {
    document.getElementById('uploadForm').reset();
    document.getElementById('uploadBtn').disabled = false;
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('entityTabs').style.display = 'none';
    document.getElementById('message').innerHTML = '';

    if (pollInterval) {
      clearInterval(pollInterval);
    }
    if (window.searchTimeout) {
      clearTimeout(window.searchTimeout);
    }

    currentJobId = null;
    window.currentGraphName = null;
    window.entityTypes = null;
  }
  
  // Make functions available globally for onclick handlers
  window.activateTab = activateTab;
  window.activateTabDirect = activateTabDirect;
  window.loadEntitiesByType = loadEntitiesByType;
  window.filterEntities = filterEntities;
  window.resetForm = resetForm;
  window.loadGraphsList = loadGraphsList;
  window.filterGraphs = filterGraphs;
  window.changeGraphsPage = changeGraphsPage;
  window.refreshGraphsList = refreshGraphsList;
  window.confirmDeleteGraph = confirmDeleteGraph;
  window.deleteGraph = deleteGraph;
  
}); // End DOMContentLoaded