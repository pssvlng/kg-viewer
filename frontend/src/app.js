console.log('Frontend JavaScript loaded successfully - VERSION: 20241208_SUMMARY_FIX_V2');
console.log('Using showEntityTabsDirectly function - Graph info in Summary tab');

const API_URL = 'http://localhost:5000';
let currentJobId = null;
let pollInterval = null;

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, setting up event listeners');
  
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
      
      const response = await fetch(`${API_URL}/upload_file`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success && result.jobId) {
        currentJobId = result.jobId;
        showMessage(`Upload started successfully! Tracking job: ${result.jobId}`, 'success');
        startPolling();
      } else {
        throw new Error(result.error || 'Upload failed');
      }
      
    } catch (error) {
      showMessage(`Error: ${error.message}`, 'error');
      document.getElementById('uploadBtn').disabled = false;
      document.getElementById('progressSection').style.display = 'none';
    }
  });
  
  function startPolling() {
    pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/upload/status/${currentJobId}`);
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
      // Show tabs directly in resultsContent to bypass visibility issues
      showEntityTabsDirectly(job.entityStats.entityTypes, graphName, job);
    } else {
      console.log('No entity stats found or empty');
      // Fallback: show basic results if no entity stats
      showBasicResults(graphName, job);
    }
  }
  
  function showBasicResults(graphName, job) {
    const graphUri = `http://localhost:8080/graph/${graphName}`;
    const sparqlQuery = `select * from <${graphUri}> where { ?s ?p ?o } LIMIT 100`;
    const sparqlUrl = `http://localhost:8890/sparql?query=${encodeURIComponent(sparqlQuery)}`;

    const resultsHtml = `
      <div class="message success">
        <strong>Upload Completed Successfully!</strong>
      </div>
      <p><strong>Graph Name:</strong> ${graphName}</p>
      <p><strong>Graph URI:</strong> <code>${graphUri}</code></p>
      <p><strong>Total Triples:</strong> ${job.total_triples}</p>
      <p><strong>SPARQL Endpoint:</strong> <a href="${sparqlUrl}" target="_blank" class="endpoint-link">Query Data</a></p>
      <p><strong>LODView Browser:</strong> <a href="http://localhost:8080" target="_blank" class="endpoint-link">Browse RDF Resources</a></p>
    `;

    document.getElementById('resultsContent').innerHTML = resultsHtml;
    // Hide entity tabs when showing basic results
    document.getElementById('entityTabs').style.display = 'none';
  }
  
  function showEntityTabsDirectly(entityTypes, graphName, job) {
    console.log('showEntityTabsDirectly called with:', entityTypes.length, 'types');
    console.log('Graph name:', graphName);
    console.log('Total triples:', job.total_triples);
    
    const graphUri = `http://localhost:8080/graph/${graphName}`;
    const sparqlQuery = `select * from <${graphUri}> where { ?s ?p ?o } LIMIT 100`;
    const sparqlUrl = `http://localhost:8890/sparql?query=${encodeURIComponent(sparqlQuery)}`;
    
    // Create the complete tabs HTML directly
    let tabsHtml = `
      <div class="message success">
        <strong>Upload Completed Successfully!</strong>
      </div>
      <h2>Knowledge Graph Analysis Results</h2>
      
      <div style="margin: 20px 0; padding: 20px; border: 1px solid #ccc; border-radius: 8px; background: white;">
        <div class="tabs" style="border-bottom: 2px solid #e0e0e0; margin-bottom: 20px;">
          <button class="tab active" onclick="activateTabDirect('summary')" style="display: inline-block; padding: 10px 20px; cursor: pointer; border: none; background: none; font-size: 14px; margin-right: 5px; border-bottom: 2px solid #1976d2; color: #1976d2; font-weight: bold;">Summary</button>`;
    
    // Add entity type tabs
    entityTypes.forEach(entityType => {
      tabsHtml += `<button class="tab" onclick="activateTabDirect('${encodeURIComponent(entityType.uri)}')" style="display: inline-block; padding: 10px 20px; cursor: pointer; border: none; background: none; font-size: 14px; margin-right: 5px; border-bottom: 2px solid transparent;">${entityType.name} (${entityType.count})</button>`;
    });
    
    tabsHtml += `
        </div>
        
        <div id="tab-content-summary" class="tab-content" style="display: block;">
          <h3>Graph Information</h3>
          <p><strong>Graph Name:</strong> ${graphName}</p>
          <p><strong>Total Triples:</strong> ${job.total_triples}</p>
          <p><strong>SPARQL Endpoint:</strong> <a href="${sparqlUrl}" target="_blank" class="endpoint-link">Query Data</a></p>
          <p><strong>LODView Browser:</strong> <a href="http://localhost:8080" target="_blank" class="endpoint-link">Browse RDF Resources</a></p>
          
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
      const url = `${API_URL}/api/entities/${window.currentGraphName}?type=${encodeURIComponent(typeUri)}&page=${page}&limit=20&search=${encodeURIComponent(searchFilter)}`;
      
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
  }  // Make functions available globally for onclick handlers
  window.activateTab = activateTab;
  window.activateTabDirect = activateTabDirect;
  window.loadEntitiesByType = loadEntitiesByType;
  window.filterEntities = filterEntities;
  window.resetForm = resetForm;
  
}); // End DOMContentLoaded