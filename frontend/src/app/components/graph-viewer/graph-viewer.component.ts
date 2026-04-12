import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ContentNavigable, ContentNavigationEvent } from '../../services/content-navigation.interface';
import { GraphData, GraphVisualizationService, LiteralProperty } from '../../services/graph-visualization.service';

declare var cytoscape: any;

@Component({
  selector: 'app-graph-viewer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
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
          <button mat-button (click)="resetGraph()" matTooltip="Reset to original state">
            <mat-icon>refresh</mat-icon>
            Reset
          </button>
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
          <mat-checkbox 
            [(ngModel)]="includeBidirectionalRelationships" 
            (change)="onBidirectionalToggle($event)"
            matTooltip="Include incoming connections when expanding nodes">
            Bidirectional expansion
          </mat-checkbox>
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
  @Input() graphUri?: string;
  @Input() isInContainer: boolean = false;
  @Input() preserveState: any = null; // State to preserve for back navigation
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
  expandedNodesData = new Map<string, any>(); // Store original expansion data
  includeBidirectionalRelationships = false;
  lastSelectedNode: string | null = null; // Track last clicked node for orange color
  originalEntityUri: string = ''; // Track original entity for reset functionality

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
        'background-color': '#1976d2',  // Default blue for all nodes
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
      selector: 'node[expanded = "true"]',
      style: {
        'background-color': '#ff9800',  // Orange for expanded nodes
        'border-color': '#f57c00',
        'border-width': 3
      }
    },
    {
      selector: 'node:selected',
      style: {
        'background-color': '#ff9800',  // Orange for selected nodes
        'border-color': '#f57c00',
        'border-width': 3
      }
    },
    {
      selector: 'node[isCentral = "true"]',
      style: {
        'background-color': '#f44336',  // Red for central node - ALWAYS LAST
        'border-color': '#d32f2f',
        'border-width': 4,
        'width': 60,
        'height': 60
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
  ) {}

  ngOnInit() {
    // Store original entity URI for reset functionality
    this.originalEntityUri = this.entityUri || '';
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

      
      // Fit and center the graph
      setTimeout(() => {
        if (this.cy) {
          this.cy.fit();
          this.cy.center();
          
          // Mark the central node as expanded since its connections are already loaded
          this.expandedNodes.add(this.entityUri);
          const centralNode = this.cy.getElementById(this.entityUri);
          if (centralNode.length > 0) {
            centralNode.data('expanded', 'true');
          }
          
          // Store initial graph data as expansion data for the central node
          // Use depth=1 to ensure we only get immediate connections
          this.graphService.getEntityGraph(this.graphName, this.entityUri, 1, 'both', this.graphUri)
            .subscribe({
              next: (centralData) => {
                const normalizedData = {
                  ...centralData,
                  nodes: centralData.nodes.map((node: any) => ({
                    ...node,
                    id: node.uri || node.id,
                    uri: node.uri || node.id
                  }))
                };
                this.expandedNodesData.set(this.entityUri, normalizedData);
              },
              error: (err) => {
                console.error('Error storing initial central data:', err);
              }
            });
        }
      }, 100);
    } catch (error) {
      console.error('Error initializing cytoscape:', error);
    }
  }

  loadGraph(depth: number = 1) {
    this.loading = true;
    this.graphService.getEntityGraph(this.graphName, this.entityUri, depth, 'both', this.graphUri)
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
    const elements: any[] = [];

    // Add nodes
    data.nodes.forEach(node => {
      const isCentral = node.isCentral === true || node.uri === this.entityUri;
      
      elements.push({
        data: {
          id: node.uri,
          label: node.label || this.getUriFragment(node.uri),
          uri: node.uri,
          isCentral: isCentral ? 'true' : 'false',
          expanded: 'false'  // Initially not expanded
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

    return elements;
  }  onNodeClick(event: any) {
    const nodeUri = event.target.data('uri');
    const nodeLabel = event.target.data('label');
    
    // Clear previous selection
    if (this.cy) {
      this.cy.nodes().unselect();
    }
    
    // Select the clicked node (this will apply orange color)
    event.target.select();
    
    // Track the last selected node
    this.lastSelectedNode = nodeUri;
    
    // Expand the node's connections
    this.expandNodeConnections(nodeUri);
    
    // Load and display node properties
    this.loadEntityLiterals(nodeUri);
    this.selectedNodeLabel = nodeLabel;
  }

  expandNodeConnections(nodeUri: string) {
    // Don't expand the central node - its connections are already loaded
    if (nodeUri === this.entityUri) {
      // Just mark it as expanded for tracking purposes
      this.expandedNodes.add(nodeUri);
      // Update the visual state (central stays red due to CSS priority)
      if (this.cy) {
        const centralNode = this.cy.getElementById(nodeUri);
        if (centralNode.length > 0) {
          centralNode.data('expanded', 'true');
        }
      }
      return;
    }

    // Check if this node has already been expanded
    if (this.expandedNodes.has(nodeUri)) {
      return;
    }
    
    // Load connected nodes for the clicked node (depth=1 for single level expansion)
    this.graphService.getEntityGraph(this.graphName, nodeUri, 1, 'both', this.graphUri)
      .subscribe({
        next: (newGraphData) => {
          // Store the original expansion data with consistent node structure
          const normalizedData = {
            ...newGraphData,
            nodes: newGraphData.nodes.map((node: any) => ({
              ...node,
              id: node.uri || node.id,
              uri: node.uri || node.id
            })),
            edges: newGraphData.edges.map((edge: any) => ({
              ...edge,
              source: edge.source,
              target: edge.target
            }))
          };
          
          this.expandedNodesData.set(nodeUri, normalizedData);
          
          // Filter based on bidirectional setting
          const filteredGraphData = this.filterGraphData(normalizedData, nodeUri);
                    
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
      }
    });

    if (elementsToAdd.length > 0) {
      // Add new elements to cytoscape
      this.cy.add(elementsToAdd);
      
      // Mark the expanded node as expanded for tracking and coloring
      this.expandedNodes.add(expandedNodeUri);
      const expandedNode = this.cy.getElementById(expandedNodeUri);
      if (expandedNode.length > 0) {
        expandedNode.data('expanded', 'true');
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
    } else {
      // Still mark as expanded even if no new nodes were found
      this.expandedNodes.add(expandedNodeUri);
      const expandedNode = this.cy.getElementById(expandedNodeUri);
      if (expandedNode.length > 0) {
        expandedNode.data('expanded', 'true');
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
        graphName: this.graphName,
        graphUri: this.graphUri
      },
      title: `Graph: ${nodeLabel}`
    });
  }

  loadEntityLiterals(entityUri: string) {
    this.graphService.getEntityLiterals(this.graphName, entityUri, this.graphUri)
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

  onBidirectionalToggle(event: any) {
    console.log('Bidirectional toggle changed to:', event.checked);
    console.log('Current expanded nodes:', this.expandedNodes);
    console.log('Current expanded data keys:', Array.from(this.expandedNodesData.keys()));
    
    this.includeBidirectionalRelationships = event.checked;
    
    // Only refresh if we have expanded nodes
    if (this.expandedNodesData.size > 0) {
      try {
        this.refreshExpandedNodes();
      } catch (error) {
        console.error('Error refreshing expanded nodes:', error);
        // Fallback: reload the entire graph
        this.loadGraph();
      }
    }
  }

  filterGraphData(graphData: any, expandedNodeUri: string) {
    
    if (this.includeBidirectionalRelationships) {
      // Include all connections (bidirectional) but only direct connections of the expanded node
      const directEdges = graphData.edges.filter((edge: any) => 
        edge.source === expandedNodeUri || edge.target === expandedNodeUri
      );
      
      // Get all node IDs involved in direct connections
      const connectedNodeIds = new Set<string>();
      connectedNodeIds.add(expandedNodeUri); // Include the expanded node itself
      
      directEdges.forEach((edge: any) => {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
      });
      
      const filteredNodes = graphData.nodes.filter((node: any) => {
        const nodeId = node.uri || node.id;
        return connectedNodeIds.has(nodeId);
      });
      
      console.log('Bidirectional mode - filtered to direct connections only');
      return {
        ...graphData,
        nodes: filteredNodes,
        edges: directEdges
      };
    } else {
      // Filter to only include outward edges from the expanded node (single depth)
      const outwardEdges = graphData.edges.filter((edge: any) => edge.source === expandedNodeUri);
      
      // Get the target node IDs from the outward edges
      const connectedNodeIds = new Set(outwardEdges.map((edge: any) => edge.target));
      
      // Include the expanded node itself and all nodes it points to
      const filteredNodes = graphData.nodes.filter((node: any) => {
        const nodeId = node.uri || node.id;
        return nodeId === expandedNodeUri || connectedNodeIds.has(nodeId);
      });
      
      const result = {
        ...graphData,
        nodes: filteredNodes,
        edges: outwardEdges
      };
      
      console.log(`Outward mode - filtered to ${filteredNodes.length} nodes and ${outwardEdges.length} edges`);
      return result;
    }
  }

  refreshExpandedNodes() {
    if (!this.cy || this.expandedNodesData.size === 0) {
      return;
    }

    console.log('Refreshing expanded nodes with bidirectional:', this.includeBidirectionalRelationships);
    console.log('Expanded nodes data:', this.expandedNodesData);
    console.log('Expanded nodes set:', this.expandedNodes);

    // Clear the current graph completely and rebuild from scratch
    this.cy.elements().remove();
    
    // Start with the central node
    console.log(`Creating central node: ${this.entityUri}`);
    const centralElement = {
      data: {
        id: this.entityUri,
        label: this.entityLabel,
        uri: this.entityUri,
        isCentral: 'true',  // Central node always red
        expanded: this.expandedNodes.has(this.entityUri) ? 'true' : 'false'
      }
    };
    console.log('Central element data:', centralElement.data);
    
    // Collections for all nodes and edges
    const allNodes = new Map<string, any>();
    const allEdges = new Map<string, any>();
    
    // Add central node
    allNodes.set(this.entityUri, centralElement);
    
    // Process each expanded node's data and apply filtering
    this.expandedNodesData.forEach((originalData, expandedNodeUri) => {
      console.log(`Processing expansion data for node: ${expandedNodeUri}`);
      
      const filteredData = this.filterGraphData(originalData, expandedNodeUri);
      
      // Add all nodes from this expansion
      filteredData.nodes.forEach((node: any) => {
        const nodeId = node.uri || node.id;
        if (!allNodes.has(nodeId)) {
          const isCentral = nodeId === this.entityUri;
          console.log(`Adding node to refresh: ${nodeId}, isCentral: ${isCentral}`);
          
          allNodes.set(nodeId, {
            data: {
              id: nodeId,
              label: node.label,
              uri: nodeId,
              isCentral: isCentral ? 'true' : 'false',
              expanded: this.expandedNodes.has(nodeId) ? 'true' : 'false'  // Track expansion for coloring
            }
          });
        }
      });
      
      // Add all edges from this expansion
      filteredData.edges.forEach((edge: any) => {
        const edgeId = `${edge.source}---${edge.target}---${edge.uri}`;
        if (!allEdges.has(edgeId)) {
          allEdges.set(edgeId, {
            data: {
              id: edgeId,
              source: edge.source,
              target: edge.target,
              label: edge.label,
              uri: edge.uri
            }
          });
        }
      });
    });
    
    // Convert maps to arrays and add to cytoscape
    const elementsToAdd = [...allNodes.values(), ...allEdges.values()];
    
    console.log('Adding elements to cytoscape:', elementsToAdd.length);
    console.log('Nodes:', allNodes.size, 'Edges:', allEdges.size);
    
    if (elementsToAdd.length > 0) {
      this.cy.add(elementsToAdd);
      
      // Restore selection state for the last selected node
      if (this.lastSelectedNode && this.cy.getElementById(this.lastSelectedNode).length > 0) {
        this.cy.getElementById(this.lastSelectedNode).select();
      }
      
      // Run layout
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
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event) {
    if (this.isFullscreen) {
      this.exitFullscreen();
      (event as KeyboardEvent).preventDefault();
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

  resetGraph() {
    // Reset to initial state with original entity while preserving zoom/pan
    this.expandedNodes.clear();
    this.expandedNodesData.clear();
    this.lastSelectedNode = null;
    
    if (this.originalEntityUri && this.cy) {
      // Store current zoom and pan settings
      const currentZoom = this.cy.zoom();
      const currentPan = this.cy.pan();
      
      // Reset entity URI and reload graph
      this.entityUri = this.originalEntityUri;
      this.loadGraph(1);
      
      // Restore zoom and pan settings after a short delay
      setTimeout(() => {
        if (this.cy) {
          this.cy.zoom(currentZoom);
          this.cy.pan(currentPan);
        }
      }, 100);
    } else if (this.originalEntityUri) {
      // Fallback if cy is not available
      this.entityUri = this.originalEntityUri;
      this.loadGraph(1);
    }
  }

  goBack() {
    if (this.isInContainer) {
      // Use content navigation with restore state
      this.contentNavigation.emit({
        action: 'back',
        data: {
          restoreState: this.preserveState
        }
      });
    } else {
      // Fallback for simple parent-child relationship
      this.backRequested.emit();
    }
  }

  getUriFragment(uri: string): string {
    if (!uri) return 'Unknown';
    
    // Extract the part after the last # or /
    const parts = uri.split(/[#/]/);
    return parts[parts.length - 1] || uri;
  }
}