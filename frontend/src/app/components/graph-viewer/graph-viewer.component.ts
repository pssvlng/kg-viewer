import { Component, OnInit, Input, Output, EventEmitter, ChangeDetectorRef, ViewChild, ElementRef, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GraphVisualizationService, GraphData, LiteralProperty } from '../../services/graph-visualization.service';
import { ContentNavigable, ContentNavigationEvent } from '../../services/content-navigation.interface';

declare var cytoscape: any;

@Component({
  selector: 'app-graph-viewer',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatTooltipModule
  ],
  template: `
    <div class="graph-container" [class.fullscreen]="isFullscreen">
      <div class="graph-header">
        <h3>{{ entityLabel || 'Entity Graph' }}</h3>
        <div class="graph-controls">
          <button mat-button (click)="zoomIn()" matTooltip="Zoom In">
            <mat-icon>zoom_in</mat-icon>
          </button>
          <button mat-button (click)="zoomOut()" matTooltip="Zoom Out">
            <mat-icon>zoom_out</mat-icon>
          </button>
          <button mat-button (click)="resetZoom()" matTooltip="Reset Zoom">
            <mat-icon>center_focus_strong</mat-icon>
          </button>
          <button mat-button (click)="collapseAll()" matTooltip="Collapse All Expanded Nodes">
            <mat-icon>collapse_content</mat-icon>
          </button>
          <button mat-button (click)="toggleFullscreen()" [matTooltip]="isFullscreen ? 'Exit Fullscreen (ESC)' : 'Enter Fullscreen'">
            <mat-icon>{{ isFullscreen ? 'fullscreen_exit' : 'fullscreen' }}</mat-icon>
          </button>
        </div>
      </div>
      
              <div class="graph-info">
          <mat-icon>info</mat-icon>
          Click nodes to expand connections and view properties.
        </div>
      
      <div class="graph-content">
        <div class="graph-main">
          <div 
            #cytoscapeContainer
            class="graph-canvas">
          </div>
          
          <mat-spinner *ngIf="loading" class="loading-spinner"></mat-spinner>
        </div>
        
        <!-- Literals Panel -->
        <div class="literals-panel" *ngIf="selectedNodeLiterals.length > 0">
          <h4>{{ selectedNodeLabel }}</h4>
          <div class="literals-content">
            <mat-list>
              <mat-list-item *ngFor="let literal of selectedNodeLiterals">
                <mat-icon matListItemIcon>info</mat-icon>
                <div matListItemTitle 
                     [matTooltip]="literal.predicateLabel || getUriFragment(literal.predicate)"
                     matTooltipPosition="above">
                  {{ literal.predicateLabel || getUriFragment(literal.predicate) }}
                </div>
                <div matListItemLine 
                     class="literal-value" 
                     [matTooltip]="literal.value"
                     matTooltipPosition="above">
                  {{ literal.value }}
                </div>
              </mat-list-item>
            </mat-list>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .graph-container {
      height: 600px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      background: white;
      overflow: hidden;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }
    
    .graph-header {
      padding: 16px;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f5f5f5;
      flex-shrink: 0;
    }
    
    .graph-info {
      padding: 8px 16px;
      background: #f9f9f9;
      border-bottom: 1px solid #e0e0e0;
      color: #666;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    
    .graph-info mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }
    
    .graph-header h3 {
      margin: 0;
      color: #1976d2;
    }
    
    .graph-controls {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    
    .graph-controls button {
      min-width: auto;
      white-space: nowrap;
    }
    
    .graph-content {
      flex: 1;
      display: flex;
      min-height: 0;
      overflow: hidden;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }
    
    .graph-main {
      flex: 1;
      position: relative;
      background: white;
      min-height: 0;
      overflow: hidden;
      min-width: 0;
      max-width: 100%;
    }
    
    .graph-canvas {
      height: 100%;
      width: 100%;
      max-height: 100%;
      max-width: 100%;
      overflow: hidden;
      position: relative;
    }
    
    .graph-canvas > * {
      max-width: 100% !important;
      max-height: 100% !important;
      overflow: hidden !important;
    }
    
    .loading-spinner {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1000;
    }
    
    .literals-panel {
      width: 300px;
      min-width: 300px;
      max-width: 300px;
      border-left: 1px solid #e0e0e0;
      background: #fafafa;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      overflow: hidden;
    }
    
    .literals-panel h4 {
      padding: 16px;
      margin: 0;
      background: #f0f0f0;
      border-bottom: 1px solid #e0e0e0;
      color: #1976d2;
    }
    
    .literals-content {
      flex: 1;
      overflow-y: auto;
    }
    
    .literal-value {
      font-family: monospace;
      color: #666;
      word-break: break-all;
    }
    
    .graph-container.fullscreen {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      max-height: 100vh;
      max-width: 100vw;
      z-index: 9999;
      background: white;
      overflow: hidden;
    }
    
    .graph-container.fullscreen .graph-content {
      width: 100%;
      height: calc(100vh - 60px);
      max-width: 100vw;
      overflow: hidden;
      display: flex;
    }
    
    .graph-container.fullscreen .graph-main {
      flex: 1;
      height: 100%;
      overflow: hidden;
      max-height: 100%;
      min-width: 0;
    }
    
    .graph-container.fullscreen .literals-panel {
      width: 300px;
      min-width: 300px;
      max-width: 300px;
      height: 100%;
      max-height: 100%;
      overflow: hidden;
      flex-shrink: 0;
    }
    
    .graph-container.fullscreen .graph-canvas {
      height: 100%;
      width: 100%;
      max-height: 100%;
      overflow: hidden;
    }
    
    @media (max-width: 768px) {
      .graph-content {
        flex-direction: column;
      }
      
      .literals-panel {
        width: 100%;
        max-height: 200px;
      }
    }
  `]
})
export class GraphViewerComponent implements OnInit, AfterViewInit, OnDestroy, ContentNavigable {
  @Input() entityUri!: string;
  @Input() entityLabel!: string;
  @Input() graphName!: string;
  @Input() isInContainer: boolean = false;
  @Output() contentNavigation = new EventEmitter<ContentNavigationEvent>();
  @Output() backRequested = new EventEmitter<void>();
  @ViewChild('cytoscapeContainer', { static: false }) cytoscapeContainer!: ElementRef;

  graphElements: any[] = [];
  selectedNodeLiterals: LiteralProperty[] = [];
  selectedNodeLabel: string = '';
  loading = false;
  zoom = 1;
  pan = { x: 0, y: 0 };
  cy: any; // Cytoscape instance
  isFullscreen = false;
  expandedNodes = new Set<string>(); // Track which nodes have been expanded

  // Cytoscape configuration
  layout = {
    name: 'cose',
    idealEdgeLength: 100,
    nodeOverlap: 20,
    refresh: 20,
    fit: true,
    padding: 30,
    randomize: false,
    componentSpacing: 100,
    nodeRepulsion: 400000,
    edgeElasticity: 100,
    nestingFactor: 5,
    gravity: 80,
    numIter: 1000,
    initialTemp: 200,
    coolingFactor: 0.95,
    minTemp: 1.0
  };

  graphStyle = [
    {
      selector: 'node',
      style: {
        'background-color': '#1976d2',
        'label': 'data(label)',
        'width': 50,
        'height': 50,
        'text-valign': 'bottom',
        'text-halign': 'center',
        'color': '#333',
        'font-size': '12px',
        'text-wrap': 'wrap',
        'text-max-width': '80px',
        'border-color': '#1565c0',
        'border-width': 2
      }
    },
    {
      selector: 'node[isCentral = "true"]',
      style: {
        'background-color': '#f44336',
        'border-color': '#d32f2f',
        'border-width': 4,
        'width': 60,
        'height': 60
      }
    },
    {
      selector: 'node:selected',
      style: {
        'background-color': '#ff9800',
        'border-color': '#f57c00',
        'border-width': 3
      }
    },
    {
      selector: 'node[expanded = "true"]',
      style: {
        'background-color': '#4caf50',
        'border-color': '#388e3c',
        'border-width': 3
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': '#666',
        'target-arrow-color': '#666',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': '10px',
        'text-rotation': 'autorotate',
        'text-margin-y': -10,
        'color': '#333'
      }
    }
  ];

  constructor(
    private graphService: GraphVisualizationService,
    private cd: ChangeDetectorRef
  ) {
    console.log('GraphViewer: Constructor called');
  }

  ngOnInit() {
    console.log('GraphViewer: ngOnInit called with entityUri:', this.entityUri, 'isInContainer:', this.isInContainer);
    this.loadGraph();
  }

  ngAfterViewInit() {
    // Cytoscape will be initialized after the graph data is loaded
  }

  private initializeCytoscape() {
    if (!this.cytoscapeContainer) {
      console.error('Cytoscape container not found');
      return;
    }

    try {
      this.cy = cytoscape({
        container: this.cytoscapeContainer.nativeElement,
        elements: this.graphElements,
        style: this.graphStyle,
        layout: this.layout,
        zoom: this.zoom,
        pan: this.pan,
        userZoomingEnabled: true,
        userPanningEnabled: true,
        minZoom: 0.1,
        maxZoom: 10
      });

      // Add event listeners
      this.cy.on('tap', 'node', (evt: any) => {
        this.onNodeClick(evt);
      });

      this.cy.on('mouseover', 'node', (evt: any) => {
        this.onNodeHover(evt);
      });

      console.log('Cytoscape initialized successfully with elements:', this.graphElements);
      
      // Fit and center the graph
      setTimeout(() => {
        if (this.cy) {
          this.cy.fit();
          this.cy.center();
          
          // Mark the central node as expanded since its connections are already loaded
          this.expandedNodes.add(this.entityUri);
          const centralNode = this.cy.getElementById(this.entityUri);
          if (centralNode.length > 0) {
            centralNode.data('expanded', true);
          }
        }
      }, 100);
    } catch (error) {
      console.error('Error initializing cytoscape:', error);
    }
  }

  loadGraph(depth: number = 1) {
    this.loading = true;
    this.graphService.getEntityGraph(this.graphName, this.entityUri, depth)
      .subscribe({
        next: (data) => {
          this.graphElements = this.createCytoscapeElements(data);
          this.loadEntityLiterals(this.entityUri);
          this.loading = false;
          this.cd.detectChanges();
          
          // Initialize cytoscape after data is loaded and DOM is updated
          setTimeout(() => {
            this.initializeCytoscape();
          }, 100);
        },
        error: (err) => {
          console.error('Error loading graph:', err);
          this.loading = false;
        }
      });
  }

  private createCytoscapeElements(data: GraphData): any[] {
    console.log('Creating Cytoscape elements from data:', data);
    const elements: any[] = [];

    // Add nodes
    data.nodes.forEach(node => {
      elements.push({
        data: {
          id: node.uri,
          label: node.label || this.getUriFragment(node.uri),
          uri: node.uri,
          isCentral: node.isCentral ? 'true' : 'false',
          expanded: 'false'
        }
      });
    });

    // Add edges
    data.edges.forEach(edge => {
      // Use consistent edge ID format that includes URI and triple-dash separator
      const edgeId = `${edge.source}---${edge.target}---${edge.uri}`;
      
      elements.push({
        data: {
          id: edgeId,
          source: edge.source,
          target: edge.target,
          label: edge.label || this.getUriFragment(edge.uri),
          uri: edge.uri
        }
      });
    });

    console.log('Created elements:', elements);
    return elements;
  }  onNodeClick(event: any) {
    const node = event.target;
    if (node.isNode && node.isNode()) {
      const nodeId = node.id();
      const nodeLabel = node.data('label');
      
      this.selectedNodeLabel = nodeLabel;
      this.loadEntityLiterals(nodeId);
      
      // Expand the graph with connected nodes
      this.expandNodeConnections(nodeId);
    }
  }

  expandNodeConnections(nodeUri: string) {
    // Don't expand the central node - its connections are already loaded
    if (nodeUri === this.entityUri) {
      console.log('Skipping expansion of central node:', nodeUri);
      // Just mark it as expanded to show the green color
      this.expandedNodes.add(nodeUri);
      if (this.cy) {
        const centralNode = this.cy.getElementById(nodeUri);
        if (centralNode.length > 0) {
          centralNode.data('expanded', true);
        }
      }
      return;
    }

    // Check if this node has already been expanded
    if (this.expandedNodes.has(nodeUri)) {
      console.log('Node already expanded:', nodeUri);
      return;
    }

    console.log('Expanding graph for node:', nodeUri);
    
    // Load connected nodes for the clicked node (only outward connections)
    this.graphService.getEntityGraph(this.graphName, nodeUri, 1, 'outward')
      .subscribe({
        next: (newGraphData) => {
          console.log('Received expansion data for node:', nodeUri);
          console.log('New nodes:', newGraphData.nodes.length);
          console.log('New edges:', newGraphData.edges.length);
          console.log('Current graph has nodes:', this.cy.nodes().length);
          console.log('Current graph has edges:', this.cy.edges().length);
          
          // Filter to only include outward edges from the expanded node
          const outwardEdges = newGraphData.edges.filter(edge => edge.source === nodeUri);
          
          // Get the target node IDs from the outward edges
          const connectedNodeIds = new Set(outwardEdges.map(edge => edge.target));
          
          // Filter nodes to only include the expanded node and its outward connections
          const filteredNodes = newGraphData.nodes.filter(node => 
            node.id === nodeUri || connectedNodeIds.has(node.id)
          );
          
          const filteredGraphData = {
            ...newGraphData,
            nodes: filteredNodes,
            edges: outwardEdges
          };
          
          console.log('Filtered edges (outward only):', filteredGraphData.edges.length);
          console.log('Filtered nodes (connected only):', filteredGraphData.nodes.length);
          this.mergeGraphData(filteredGraphData, nodeUri);
        },
        error: (err) => {
          console.error('Error expanding graph:', err);
        }
      });
  }

  mergeGraphData(newGraphData: GraphData, expandedNodeUri: string) {
    if (!this.cy) {
      console.warn('Cytoscape not initialized');
      return;
    }

    const existingNodeIds = new Set();
    const existingEdgePairs = new Set(); // Track source-target pairs regardless of direction

    // Get existing elements
    this.cy.nodes().forEach((node: any) => {
      existingNodeIds.add(node.id());
    });
    
    this.cy.edges().forEach((edge: any) => {
      const source = edge.data('source');
      const target = edge.data('target');
      const uri = edge.data('uri');
      
      // Add both directions and include URI for more specific matching
      existingEdgePairs.add(`${source}|${target}`);
      existingEdgePairs.add(`${target}|${source}`);
      existingEdgePairs.add(`${source}|${target}|${uri}`);
      existingEdgePairs.add(`${target}|${source}|${uri}`);
    });

    const elementsToAdd: any[] = [];

    // Add new nodes
    newGraphData.nodes.forEach(node => {
      if (!existingNodeIds.has(node.uri)) {
        elementsToAdd.push({
          data: {
            id: node.uri,
            label: node.label,
            uri: node.uri,
            isCentral: false, // New nodes are not central
            expanded: false
          }
        });
        console.log('Adding new node:', node.label);
      }
    });

    // Add new edges with comprehensive duplicate checking
    newGraphData.edges.forEach(edge => {
      const edgePair1 = `${edge.source}|${edge.target}`;
      const edgePair2 = `${edge.target}|${edge.source}`;
      const edgePairWithUri1 = `${edge.source}|${edge.target}|${edge.uri}`;
      const edgePairWithUri2 = `${edge.target}|${edge.source}|${edge.uri}`;
      
      // Check if this edge already exists in any form
      const edgeExists = existingEdgePairs.has(edgePair1) || 
                        existingEdgePairs.has(edgePair2) ||
                        existingEdgePairs.has(edgePairWithUri1) ||
                        existingEdgePairs.has(edgePairWithUri2);
      
      if (!edgeExists) {
        // Create unique ID that includes all components
        const uniqueEdgeId = `${edge.source}---${edge.target}---${edge.uri}`;
        
        elementsToAdd.push({
          data: {
            id: uniqueEdgeId,
            source: edge.source,
            target: edge.target,
            label: edge.label,
            uri: edge.uri
          }
        });
        
        // Add to our tracking set to prevent duplicates within this batch
        existingEdgePairs.add(edgePair1);
        existingEdgePairs.add(edgePair2);
        existingEdgePairs.add(edgePairWithUri1);
        existingEdgePairs.add(edgePairWithUri2);
        
        console.log('Adding new edge:', edge.label, 'from', edge.source, 'to', edge.target);
      } else {
        console.log('Skipping duplicate edge:', edge.label, 'from', edge.source, 'to', edge.target);
      }
    });

    if (elementsToAdd.length > 0) {
      console.log('Adding elements to graph:', elementsToAdd);
      
      // Add new elements to cytoscape
      this.cy.add(elementsToAdd);
      
      // Mark the expanded node as expanded
      this.expandedNodes.add(expandedNodeUri);
      const expandedNode = this.cy.getElementById(expandedNodeUri);
      if (expandedNode.length > 0) {
        expandedNode.data('expanded', true);
      }
      
      // Run layout to position new nodes
      const layout = this.cy.layout({
        name: 'cose',
        animate: true,
        animationDuration: 1000,
        fit: true,
        padding: 30,
        nodeRepulsion: 400000,
        idealEdgeLength: 100,
        edgeElasticity: 100
      });
      layout.run();
      
      console.log(`Added ${elementsToAdd.length} new elements to the graph`);
    } else {
      console.log('No new elements to add');
      // Still mark as expanded even if no new nodes were found
      this.expandedNodes.add(expandedNodeUri);
      const expandedNode = this.cy.getElementById(expandedNodeUri);
      if (expandedNode.length > 0) {
        expandedNode.data('expanded', true);
      }
    }
  }

  onNodeHover(event: any) {
    // Could implement hover effects
  }

  navigateToNode(nodeUri: string, nodeLabel: string) {
    this.contentNavigation.emit({
      action: 'push',
      component: GraphViewerComponent,
      data: {
        entityUri: nodeUri,
        entityLabel: nodeLabel,
        graphName: this.graphName
      },
      title: `Graph: ${nodeLabel}`
    });
  }

  loadEntityLiterals(entityUri: string) {
    this.graphService.getEntityLiterals(this.graphName, entityUri)
      .subscribe({
        next: (literals) => {
          this.selectedNodeLiterals = literals;
          this.cd.detectChanges();
        },
        error: (err) => {
          console.error('Error loading entity literals:', err);
          this.selectedNodeLiterals = [];
        }
      });
  }

  // Graph control methods
  zoomIn() {
    if (this.cy) {
      this.cy.zoom(this.cy.zoom() * 1.2);
    }
  }

  zoomOut() {
    if (this.cy) {
      this.cy.zoom(this.cy.zoom() * 0.8);
    }
  }

  resetZoom() {
    if (this.cy) {
      this.cy.fit();
      this.cy.center();
    }
  }

  collapseAll() {
    if (!this.cy) return;
    
    console.log('Collapsing all expanded nodes');
    
    // Reset to original graph by reloading
    this.expandedNodes.clear();
    this.loadGraph();
  }

  toggleFullscreen() {
    if (this.isFullscreen) {
      this.exitFullscreen();
    } else {
      this.enterFullscreen();
    }
  }

  enterFullscreen() {
    this.isFullscreen = true;
    document.body.style.overflow = 'hidden'; // Prevent body scroll
    
    // Force change detection
    this.cd.detectChanges();
    
    // Resize cytoscape after entering fullscreen
    setTimeout(() => {
      if (this.cy) {
        this.cy.resize();
        this.cy.fit();
      }
    }, 200);
  }

  exitFullscreen() {
    this.isFullscreen = false;
    document.body.style.overflow = ''; // Restore body scroll
    
    // Force change detection
    this.cd.detectChanges();
    
    // Aggressive container reset and resize approach
    setTimeout(() => {
      if (this.cy && this.cytoscapeContainer) {
        const container = this.cytoscapeContainer.nativeElement;
        const graphContainer = container.closest('.graph-container');
        const graphContent = container.closest('.graph-content');
        const graphMain = container.closest('.graph-main');
        
        // Reset all container styles to ensure proper flex behavior
        if (graphContainer) {
          graphContainer.style.width = '';
          graphContainer.style.height = '';
          graphContainer.style.maxWidth = '';
          graphContainer.style.maxHeight = '';
        }
        
        if (graphContent) {
          graphContent.style.width = '';
          graphContent.style.height = '';
          graphContent.style.maxWidth = '';
          graphContent.style.maxHeight = '';
        }
        
        if (graphMain) {
          graphMain.style.width = '';
          graphMain.style.height = '';
          graphMain.style.maxWidth = '';
          graphMain.style.maxHeight = '';
        }
        
        // Force container style reset
        container.style.width = '';
        container.style.height = '';
        container.style.maxWidth = '';
        container.style.maxHeight = '';
        
        // Force Cytoscape to recognize container changes
        this.cy.resize();
        this.cy.fit();
        this.cy.center();
      }
    }, 50);
    
    // Second attempt with more aggressive reset
    setTimeout(() => {
      if (this.cy && this.cytoscapeContainer) {
        const container = this.cytoscapeContainer.nativeElement;
        
        // Get actual container dimensions after CSS has been applied
        const rect = container.getBoundingClientRect();
        
        // Ensure the graph properly fits within the available space
        this.cy.resize();
        this.cy.fit(undefined, 20); // Fit with smaller padding to avoid overflow
        this.cy.center();
      }
    }, 150);
    
    // Final resize with complete viewport reset
    setTimeout(() => {
      if (this.cy) {
        // Complete reset to ensure no scroll bars
        this.cy.reset();
        this.cy.fit(undefined, 10); // Minimal padding to prevent scroll bars
        this.cy.center();
        this.cy.resize(); // Final resize to ensure container bounds are respected
      }
    }, 300);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent) {
    if (this.isFullscreen) {
      this.exitFullscreen();
      event.preventDefault();
    }
  }

  ngOnDestroy() {
    // Clean up fullscreen state if component is destroyed while in fullscreen
    if (this.isFullscreen) {
      document.body.style.overflow = '';
    }
  }

  expandGraph() {
    this.loadGraph(2); // Load with depth 2
  }

  goBack() {
    this.backRequested.emit();
  }

  getUriFragment(uri: string): string {
    if (!uri) return 'Unknown';
    
    // Extract the part after the last # or /
    const parts = uri.split(/[#/]/);
    return parts[parts.length - 1] || uri;
  }
}