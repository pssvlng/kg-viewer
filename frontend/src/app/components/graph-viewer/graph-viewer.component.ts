import { Component, OnInit, Input, Output, EventEmitter, ChangeDetectorRef, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
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
    <div class="graph-container">
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
        </div>
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
                <div matListItemTitle>{{ literal.predicateLabel || getUriFragment(literal.predicate) }}</div>
                <div matListItemLine class="literal-value">{{ literal.value }}</div>
              </mat-list-item>
            </mat-list>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .graph-container {
      height: 100vh;
      display: flex;
      flex-direction: column;
      background: white;
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
    }
    
    .graph-main {
      flex: 1;
      position: relative;
      background: white;
      min-height: 500px;
    }
    
    .graph-canvas {
      height: 100%;
      width: 100%;
      min-height: 500px;
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
      border-left: 1px solid #e0e0e0;
      background: #fafafa;
      display: flex;
      flex-direction: column;
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
export class GraphViewerComponent implements OnInit, AfterViewInit, ContentNavigable {
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
          isCentral: node.isCentral ? 'true' : 'false'
        }
      });
    });

    // Add edges
    data.edges.forEach(edge => {
      elements.push({
        data: {
          id: edge.id,
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
      
      // Option to navigate to clicked node if it's not the central node
      if (!node.data('isCentral')) {
        // Could implement navigation to new graph centered on this node
        // this.navigateToNode(nodeId, nodeLabel);
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