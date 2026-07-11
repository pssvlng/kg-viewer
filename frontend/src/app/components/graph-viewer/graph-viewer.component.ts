import { CommonModule, DOCUMENT } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Inject, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ContentNavigable, ContentNavigationEvent } from '../../services/content-navigation.interface';
import { GraphData, GraphVisualizationService, LiteralProperty } from '../../services/graph-visualization.service';

declare var cytoscape: any;

@Component({
  selector: 'app-graph-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatSelectModule,
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
          <button mat-button (click)="fitToScreen()" matTooltip="Fit to screen">
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
          <mat-checkbox
            [(ngModel)]="inPlaceExpansion"
            (change)="onInPlaceExpansionToggle($event)"
            matTooltip="Keep existing nodes in their current position when expanding">
            In place expansion
          </mat-checkbox>
          <div class="panel-toggle-row">
            <mat-form-field class="max-edges-field" appearance="outline" subscriptSizing="dynamic">
              <mat-label>Max edges</mat-label>
              <mat-select [(ngModel)]="maxEdgesSelection" (selectionChange)="onMaxEdgesChange()">
                <mat-option [value]="50">50</mat-option>
                <mat-option [value]="100">100</mat-option>
                <mat-option value="all">Show all</mat-option>
              </mat-select>
            </mat-form-field>
            <button
              mat-button
              class="panel-toggle-button"
              (click)="toggleLiteralsPanel()"
              [matTooltip]="showLiteralsPanel ? 'Hide attributes panel' : 'Show attributes panel'">
              <mat-icon>{{ showLiteralsPanel ? 'visibility_off' : 'visibility' }}</mat-icon>
              {{ showLiteralsPanel ? 'Hide Attributes' : 'Show Attributes' }}
            </button>
          </div>
        </div>
      </div>
      
      <div class="graph-info">
        <div class="graph-info-text">
          <mat-icon>info</mat-icon>
          Click nodes to expand connections and view properties.
        </div>
      </div>
      
      <div class="graph-content">
        <div class="graph-main">
          <div 
            #cytoscapeContainer
            class="graph-canvas">
          </div>
          
          <mat-spinner *ngIf="loading" class="loading-spinner"></mat-spinner>
          <div class="cy-tooltip" *ngIf="tooltipVisible"
               [style.left.px]="tooltipX" [style.top.px]="tooltipY">{{ tooltipText }}</div>
        </div>
        
        <!-- Literals Panel -->
        <div class="literals-panel" *ngIf="showLiteralsPanel && selectedNodeLiterals.length > 0">
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
                  <a *ngIf="isUri(literal.value)"
                     [href]="literal.value"
                     target="_blank"
                     rel="noopener noreferrer"
                     class="literal-uri-link">{{ literal.value }}</a>
                  <span *ngIf="!isUri(literal.value)">{{ literal.value }}</span>
                </div>
              </mat-list-item>
            </mat-list>
          </div>
        </div>
      </div>

      <div class="graph-legend-bar" aria-label="Node color legend">
        <div class="graph-legend">
          <span class="legend-item">
            <span class="legend-dot legend-dot-root"></span>
            Root node
          </span>
          <span class="legend-item">
            <span class="legend-dot legend-dot-expanded"></span>
            Expanded node
          </span>
          <span class="legend-item">
            <span class="legend-dot legend-dot-unexpanded"></span>
            Unexpanded node
          </span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .graph-container {
      height: min(72vh, calc(100vh - 180px));
      min-height: 380px;
      max-height: 900px;
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
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .graph-info-text {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .graph-legend {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #444;
      flex-wrap: wrap;
      font-size: 11px;
    }

    .graph-legend-bar {
      border-top: 1px solid #e0e0e0;
      background: #fafafa;
      padding: 4px 12px;
      flex-shrink: 0;
    }

    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }

    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      border: 1px solid rgba(0, 0, 0, 0.2);
    }

    .legend-dot-root {
      background: #f44336;
    }

    .legend-dot-expanded {
      background: #fdd835;
    }

    .legend-dot-unexpanded {
      background: #90caf9;
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
      justify-content: flex-end;
    }
    
    .graph-controls button {
      min-width: auto;
      white-space: nowrap;
    }

    .panel-toggle-row {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 2px;
    }

    .max-edges-field {
      width: 150px;
      margin: 0;
    }

    .max-edges-field ::ng-deep .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }

    .max-edges-field ::ng-deep .mat-mdc-text-field-wrapper {
      height: 38px;
      padding: 0 10px;
    }

    .max-edges-field ::ng-deep .mat-mdc-form-field-infix {
      min-height: 30px;
      padding-top: 4px;
      padding-bottom: 4px;
    }

    .panel-toggle-button {
      min-width: auto;
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

    .literal-uri-link {
      color: #1976d2;
      text-decoration: none;
      word-break: break-all;
    }

    .literal-uri-link:hover {
      text-decoration: underline;
    }
    
    .cy-tooltip {
      position: absolute;
      background: rgba(33, 33, 33, 0.92);
      color: #fff;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      pointer-events: none;
      z-index: 100;
      max-width: 320px;
      word-break: break-word;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      line-height: 1.4;
    }
    
    .graph-container.fullscreen {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw !important;
      height: 100vh !important;
      max-height: 100vh !important;
      max-width: 100vw !important;
      z-index: 9999;
      background: white;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    .graph-container.fullscreen .graph-content {
      width: 100%;
      flex: 1;
      min-height: 0;
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
      .graph-container {
        height: min(68vh, calc(100vh - 140px));
        min-height: 320px;
      }

      .graph-content {
        flex-direction: column;
      }

      .graph-info {
        flex-direction: column;
        align-items: flex-start;
      }

      .panel-toggle-row {
        justify-content: flex-start;
      }

      .graph-legend-bar {
        padding: 4px 8px;
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

  private _fsPlaceholder: Comment | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: number | null = null;
  private overlayContainerEl: HTMLElement | null = null;
  private overlayContainerPrevZIndex: string | null = null;
  private pendingTimers = new Set<number>();

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
  inPlaceExpansion = true;
  showLiteralsPanel = true;
  tooltipVisible = false;
  tooltipText = '';
  tooltipX = 0;
  tooltipY = 0;
  lastSelectedNode: string | null = null; // Track last clicked node for selected state
  originalEntityUri: string = ''; // Track original entity for reset functionality
  maxEdgesSelection: number | 'all' = 50;

  private readonly destroy$ = new Subject<void>();

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
        'background-color': '#90caf9',  // Light blue for unexpanded nodes
        'label': 'data(displayLabel)',
        'width': 50,
        'height': 50,
        'text-valign': 'bottom',
        'text-halign': 'center',
        'color': '#333',
        'font-size': '12px',
        'text-wrap': 'wrap',
        'text-max-width': '80px',
        'border-color': '#64b5f6',
        'border-width': 2
      }
    },
    {
      selector: 'node[expanded = "true"]',
      style: {
        'background-color': '#fdd835',  // Yellow for expanded nodes
        'border-color': '#f9a825',
        'border-width': 3
      }
    },
    {
      selector: 'node:selected',
      style: {
        'background-color': '#fdd835',
        'border-color': '#f9a825',
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
      selector: 'node[isAggregate = "true"]',
      style: {
        'background-color': '#90caf9',
        'border-color': '#64b5f6',
        'border-width': 3,
        'width': 36,
        'height': 36,
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '13px'
      }
    },
    {
      selector: 'node[isAggregate = "true"][expanded = "true"]',
      style: {
        'background-color': '#fdd835',
        'border-color': '#f9a825',
        'border-width': 4
      }
    },
    {
      selector: 'node[isAggregate = "true"]:selected',
      style: {
        'background-color': '#fdd835',
        'border-color': '#f9a825',
        'border-width': 4
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
    private cd: ChangeDetectorRef,
    private el: ElementRef,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit() {
    // Store original entity URI for reset functionality
    this.originalEntityUri = this.entityUri || '';
    this.loadGraph();
  }

  ngAfterViewInit() {
    // Cytoscape will be initialized after the graph data is loaded
  }

  private scheduleTimeout(callback: () => void, delayMs: number): number {
    const timerId = window.setTimeout(() => {
      this.pendingTimers.delete(timerId);
      callback();
    }, delayMs);
    this.pendingTimers.add(timerId);
    return timerId;
  }

  private clearPendingTimeouts() {
    this.pendingTimers.forEach((timerId) => window.clearTimeout(timerId));
    this.pendingTimers.clear();
  }

  private destroyCyInstance() {
    if (!this.cy) {
      return;
    }

    try {
      this.cy.removeAllListeners();
      this.cy.destroy();
    } catch (error) {
      console.warn('Failed to destroy Cytoscape instance cleanly:', error);
    } finally {
      this.cy = null;
    }
  }

  private initializeCytoscape() {
    if (!this.cytoscapeContainer) {
      console.error('Cytoscape container not found');
      return;
    }

    this.destroyCyInstance();

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

      this.cy.on('mouseout', 'node', () => {
        this.tooltipVisible = false;
        this.cd.detectChanges();
      });

      this.setupResizeObserver();

      // Fit and center the graph
      this.scheduleTimeout(() => {
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
          this.graphService.getEntityGraph(this.graphName, this.entityUri, 1, 'both', this.graphUri, this.getMaxEdgesParam())
            .pipe(takeUntil(this.destroy$))
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
    this.graphService.getEntityGraph(this.graphName, this.entityUri, depth, 'both', this.graphUri, this.getMaxEdgesParam())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.graphElements = this.createCytoscapeElements(data);
          this.loadEntityLiterals(this.entityUri);
          this.loading = false;
          this.cd.detectChanges();
          
          // Initialize cytoscape after data is loaded and DOM is updated
          this.scheduleTimeout(() => {
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
    const nodeIds = new Set<string>();
    const edgesBySourceAndPredicate = new Map<string, any[]>();
    const edgesByTargetAndPredicate = new Map<string, any[]>();
    const nodeByUri = new Map<string, any>();
    data.nodes.forEach(n => nodeByUri.set(n.uri, n));

    const getNodeLabel = (uri: string) => nodeByUri.get(uri)?.label || this.getUriFragment(uri);
    const addNode = (id: string, label: string, uri: string, isAgg = false) => {
      if (nodeIds.has(id)) return;
      const isCentral = !isAgg && (uri === this.entityUri || id === this.entityUri);
      const displayLabel = isAgg ? label : this.truncateLabel(label);
      elements.push({ data: { id, label, displayLabel, uri, isCentral: isCentral ? 'true' : 'false', isAggregate: isAgg ? 'true' : 'false', expanded: 'false' } });
      nodeIds.add(id);
    };
    const mkEdge = (id: string, source: string, target: string, label: string, uri: string) =>
      ({ data: { id, source, target, label, uri } });

    addNode(this.entityUri, getNodeLabel(this.entityUri), this.entityUri);

    const dedupedEdges = new Map<string, any>();
    data.edges.forEach(edge => {
      const edgeId = `${edge.source}|||${edge.target}|||${edge.uri}`;
      if (!dedupedEdges.has(edgeId)) {
        dedupedEdges.set(edgeId, edge);
      }
    });

    dedupedEdges.forEach(edge => {
      const k = `${edge.source}|||${edge.uri}`;
      const inK = `${edge.target}|||${edge.uri}`;
      if (!edgesBySourceAndPredicate.has(k)) edgesBySourceAndPredicate.set(k, []);
      if (!edgesByTargetAndPredicate.has(inK)) edgesByTargetAndPredicate.set(inK, []);
      edgesBySourceAndPredicate.get(k)!.push(edge);
      edgesByTargetAndPredicate.get(inK)!.push(edge);
    });

    const consumedEdges = new Set<string>();

    const consume = (e: any) => {
      consumedEdges.add(`${e.source}|||${e.target}|||${e.uri}`);
    };

    const isConsumed = (e: any) => consumedEdges.has(`${e.source}|||${e.target}|||${e.uri}`);

    edgesBySourceAndPredicate.forEach((groupEdges) => {
      const candidateEdges = groupEdges.filter(e => !isConsumed(e));
      if (candidateEdges.length === 0) return;

      const uniqueByTarget = new Map<string, any>();
      candidateEdges.forEach(e => { if (!uniqueByTarget.has(e.target)) uniqueByTarget.set(e.target, e); });
      const uniq = [...uniqueByTarget.values()];

      if (uniq.length > 1) {
        const src = uniq[0].source;
        const predUri = uniq[0].uri;
        const predLabel = uniq[0].label || this.getUriFragment(predUri);
        const groupKey = `${src}|||${predUri}`;
        const aggId = `aggregate:out:::${groupKey}`;
        const hidden = uniq.map(e => ({
          nodeUri: e.target,
          nodeLabel: getNodeLabel(e.target),
          predicateUri: e.uri,
          direction: 'outgoing'
        }));
        addNode(src, getNodeLabel(src), src);
        if (!nodeIds.has(aggId)) {
          elements.push({ data: { id: aggId, label: `${uniq.length}`, displayLabel: `${uniq.length}`, uri: aggId, isCentral: 'false', isAggregate: 'true', expanded: 'false', revealed: 'false', hiddenTargets: hidden } });
          nodeIds.add(aggId);
        }
        elements.push(mkEdge(`${src}---${aggId}---${predUri}`, src, aggId, predLabel, predUri));
        uniq.forEach(consume);
      }
    });

    edgesByTargetAndPredicate.forEach((groupEdges) => {
      const candidateEdges = groupEdges.filter(e => !isConsumed(e));
      if (candidateEdges.length === 0) return;

      const uniqueBySource = new Map<string, any>();
      candidateEdges.forEach(e => { if (!uniqueBySource.has(e.source)) uniqueBySource.set(e.source, e); });
      const uniq = [...uniqueBySource.values()];

      if (uniq.length > 1) {
        const tgt = uniq[0].target;
        const predUri = uniq[0].uri;
        const predLabel = uniq[0].label || this.getUriFragment(predUri);
        const groupKey = `${tgt}|||${predUri}`;
        const aggId = `aggregate:in:::${groupKey}`;
        const hidden = uniq.map(e => ({
          nodeUri: e.source,
          nodeLabel: getNodeLabel(e.source),
          predicateUri: e.uri,
          direction: 'incoming'
        }));
        addNode(tgt, getNodeLabel(tgt), tgt);
        if (!nodeIds.has(aggId)) {
          elements.push({ data: { id: aggId, label: `${uniq.length}`, displayLabel: `${uniq.length}`, uri: aggId, isCentral: 'false', isAggregate: 'true', expanded: 'false', revealed: 'false', hiddenTargets: hidden } });
          nodeIds.add(aggId);
        }
        elements.push(mkEdge(`${aggId}---${tgt}---${predUri}`, aggId, tgt, predLabel, predUri));
        uniq.forEach(consume);
      }
    });

    dedupedEdges.forEach((e) => {
      if (isConsumed(e)) return;
      addNode(e.source, getNodeLabel(e.source), e.source);
      addNode(e.target, getNodeLabel(e.target), e.target);
      elements.push(mkEdge(`${e.source}---${e.target}---${e.uri}`, e.source, e.target, e.label || this.getUriFragment(e.uri), e.uri));
      consume(e);
    });
    return elements;
  }  onNodeClick(event: any) {
    const nodeId = event.target.id();
    const nodeUri = event.target.data('uri');
    const nodeLabel = event.target.data('label');
    const isAgg = event.target.data('isAggregate') === 'true';

    if (isAgg) {
      if (this.cy) this.cy.nodes().unselect();
      event.target.unselect();
      const an = this.cy.getElementById(nodeId);
      if (an.length > 0 && an.data('revealed') !== 'true') {
        this.revealAggregateTargets(nodeId);
        an.data('revealed', 'true');
      }
      this.expandedNodes.add(nodeId);
      event.target.data('expanded', 'true');
      this.selectedNodeLabel = nodeLabel;
      this.selectedNodeLiterals = [];
      return;
    }

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

  private revealAggregateTargets(aggregateNodeId: string) {
    if (!this.cy) return;
    const an = this.cy.getElementById(aggregateNodeId);
    if (an.length === 0) return;
    const hidden = an.data('hiddenTargets') || [];
    const toAdd: any[] = [];

    hidden.forEach((t: any) => {
      const tid = t.nodeUri || t.target;
      const tl = t.nodeLabel || t.targetLabel || this.getUriFragment(tid);
      const pu = t.predicateUri;
      const direction = t.direction || 'outgoing';
      const source = direction === 'incoming' ? tid : aggregateNodeId;
      const target = direction === 'incoming' ? aggregateNodeId : tid;
      const eid = `${source}---${target}---${pu}`;
      if (this.cy.getElementById(tid).length === 0) {
        toAdd.push({ data: { id: tid, label: tl, displayLabel: this.truncateLabel(tl), uri: tid, isCentral: tid === this.entityUri ? 'true' : 'false', isAggregate: 'false', expanded: this.expandedNodes.has(tid) ? 'true' : 'false' } });
      }
      if (this.cy.getElementById(eid).length === 0) {
        toAdd.push({ data: { id: eid, source, target, label: '', uri: pu } });
      }
    });

    if (toAdd.length > 0) {
      if (this.inPlaceExpansion) {
        const existingNodes = this.cy.nodes();
        existingNodes.lock();
        this.cy.add(toAdd);
        const layout = this.cy.layout({ name: 'cose', animate: true, animationDuration: 600, fit: false, padding: 30, nodeRepulsion: 400000, idealEdgeLength: 100, edgeElasticity: 100 });
        layout.on('layoutstop', () => existingNodes.unlock());
        layout.run();
      } else {
        this.cy.add(toAdd);
        this.cy.layout({ name: 'cose', animate: true, animationDuration: 600, fit: true, padding: 30, nodeRepulsion: 400000, idealEdgeLength: 100, edgeElasticity: 100 }).run();
      }
    }
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
    this.graphService.getEntityGraph(this.graphName, nodeUri, 1, 'both', this.graphUri, this.getMaxEdgesParam())
      .pipe(takeUntil(this.destroy$))
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

    const existing = new Set<string>();
    this.cy.elements().forEach((el: any) => existing.add(el.id()));

    const incoming = this.createCytoscapeElements(newGraphData);
    const toAdd = incoming.filter((el: any) => el.data?.id && !existing.has(el.data.id));

    if (toAdd.length > 0) {
      this.expandedNodes.add(expandedNodeUri);
      const expandedNode = this.cy.getElementById(expandedNodeUri);
      if (expandedNode.length > 0) expandedNode.data('expanded', 'true');

      if (this.inPlaceExpansion) {
        const existingNodes = this.cy.nodes();
        existingNodes.lock();
        this.cy.add(toAdd);
        const layout = this.cy.layout({ name: 'cose', animate: true, animationDuration: 1000, fit: false, padding: 30, nodeRepulsion: 400000, idealEdgeLength: 100, edgeElasticity: 100 });
        layout.on('layoutstop', () => {
          existingNodes.unlock();
        });
        layout.run();
      } else {
        this.cy.add(toAdd);
        this.cy.layout({ name: 'cose', animate: true, animationDuration: 1000, fit: false, padding: 30, nodeRepulsion: 400000, idealEdgeLength: 100, edgeElasticity: 100 }).run();
      }
    } else {
      this.expandedNodes.add(expandedNodeUri);
      const expandedNode = this.cy.getElementById(expandedNodeUri);
      if (expandedNode.length > 0) expandedNode.data('expanded', 'true');
    }
  }

  onNodeHover(event: any) {
    const node = event.target;
    const fullLabel = node.data('label');
    // Only show tooltip when the label was actually truncated
    if (!fullLabel || fullLabel.length <= 50) {
      this.tooltipVisible = false;
      this.cd.detectChanges();
      return;
    }
    const pos = node.renderedPosition();
    this.tooltipText = fullLabel;
    this.tooltipX = pos.x + 15;
    this.tooltipY = pos.y - 36;
    this.tooltipVisible = true;
    this.cd.detectChanges();
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
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (literals) => {
          this.selectedNodeLiterals = literals;
          this.cd.detectChanges();
        },
        error: (err) => {
          console.error('Error loading entity literals:', err);
          this.selectedNodeLiterals = [];
          this.cd.detectChanges();
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

  fitToScreen() {
    if (this.cy) {
      this.applyFitToScreen();
    }
  }

  private applyFitToScreen() {
    if (this.cy) {
      this.cy.resize();
      this.cy.fit();
      this.cy.center();
      this.cd.detectChanges();
    }
  }

  toggleLiteralsPanel() {
    this.showLiteralsPanel = !this.showLiteralsPanel;
    this.cd.detectChanges();
    this.scheduleCyResize();
    this.scheduleTimeout(() => this.applyFitToScreen(), 90);
  }

  collapseAll() {
    if (!this.cy) return;
    
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
    this.cd.detectChanges();

    // Move the host element to document.body to escape any overflow:auto/hidden ancestor
    const host = this.el.nativeElement as HTMLElement;
    this._fsPlaceholder = document.createComment('graph-viewer-fullscreen-placeholder');
    host.parentNode!.insertBefore(this._fsPlaceholder, host);
    document.body.appendChild(host);
    document.body.style.overflow = 'hidden';
    this.raiseOverlayZIndexForFullscreen();

    this.scheduleTimeout(() => {
      if (this.cy) {
        this.cy.resize();
        this.cy.fit();
      }
    }, 200);
  }

  exitFullscreen() {
    this.isFullscreen = false;
    document.body.style.overflow = '';
    this.restoreOverlayZIndex();

    // Return host element to its original position in the DOM
    const host = this.el.nativeElement as HTMLElement;
    if (this._fsPlaceholder && this._fsPlaceholder.parentNode) {
      this._fsPlaceholder.parentNode.insertBefore(host, this._fsPlaceholder);
      this._fsPlaceholder.parentNode.removeChild(this._fsPlaceholder);
      this._fsPlaceholder = null;
    }

    this.cd.detectChanges();
    
    // Aggressive container reset and resize approach
    this.scheduleTimeout(() => {
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
    this.scheduleTimeout(() => {
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
    this.scheduleTimeout(() => {
      if (this.cy) {
        // Complete reset to ensure no scroll bars
        this.cy.reset();
        this.cy.fit(undefined, 10); // Minimal padding to prevent scroll bars
        this.cy.center();
        this.cy.resize(); // Final resize to ensure container bounds are respected
      }
    }, 300);
  }

  onInPlaceExpansionToggle(event: any) {
    this.inPlaceExpansion = event.checked;
    if (!this.cy) return;
    if (this.inPlaceExpansion) {
      // Just fit and center — keep current positions
      this.cy.fit(undefined, 30);
      this.cy.center();
    } else {
      // Run full optimised layout immediately
      this.cy.layout({ name: 'cose', animate: true, animationDuration: 800, fit: true, padding: 30, nodeRepulsion: 400000, idealEdgeLength: 100, edgeElasticity: 100 }).run();
    }
  }

  onBidirectionalToggle(event: any) {
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

  onMaxEdgesChange() {
    this.expandedNodes.clear();
    this.expandedNodesData.clear();
    this.lastSelectedNode = null;
    this.loadGraph();
  }

  private getMaxEdgesParam(): number | null {
    return this.maxEdgesSelection === 'all' ? null : this.maxEdgesSelection;
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
      
      return result;
    }
  }

  refreshExpandedNodes() {
    if (!this.cy || this.expandedNodesData.size === 0) return;

    this.cy.elements().remove();

    const allElements = new Map<string, any>();
    allElements.set(this.entityUri, {
      data: {
        id: this.entityUri,
        label: this.entityLabel,
        displayLabel: this.truncateLabel(this.entityLabel),
        uri: this.entityUri,
        isCentral: 'true',
        isAggregate: 'false',
        expanded: this.expandedNodes.has(this.entityUri) ? 'true' : 'false'
      }
    });

    this.expandedNodesData.forEach((originalData, expandedNodeUri) => {
      const filteredData = this.filterGraphData(originalData, expandedNodeUri);
      const elems = this.createCytoscapeElements(filteredData);
      elems.forEach((el: any) => {
        const eid = el.data?.id;
        if (!eid || allElements.has(eid)) return;
        const isNode = !el.data.source;
        if (isNode) el.data.expanded = this.expandedNodes.has(eid) ? 'true' : 'false';
        allElements.set(eid, el);
      });
    });

    const arr = [...allElements.values()];
    const nodeIdSet = new Set<string>();
    arr.forEach(el => { if (!el.data?.source) nodeIdSet.add(el.data?.id); });
    const toAdd = arr.filter(el => !el.data?.source || (nodeIdSet.has(el.data.source) && nodeIdSet.has(el.data.target)));

    this.cy.add(toAdd);

    if (this.lastSelectedNode && this.cy.getElementById(this.lastSelectedNode).length > 0) {
      this.cy.getElementById(this.lastSelectedNode).select();
    }

    this.cy.layout({ name: 'cose', animate: true, animationDuration: 1000, fit: true, padding: 30, nodeRepulsion: 400000, idealEdgeLength: 100, edgeElasticity: 100 }).run();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event) {
    if (this.isFullscreen) {
      this.exitFullscreen();
      (event as KeyboardEvent).preventDefault();
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.scheduleCyResize();
  }

  private setupResizeObserver() {
    if (typeof ResizeObserver === 'undefined' || !this.cytoscapeContainer) {
      return;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    const container = this.cytoscapeContainer.nativeElement as HTMLElement;
    this.resizeObserver = new ResizeObserver(() => this.scheduleCyResize());
    this.resizeObserver.observe(container);

    const graphMain = container.closest('.graph-main');
    if (graphMain) {
      this.resizeObserver.observe(graphMain);
    }
  }

  private scheduleCyResize() {
    if (!this.cy) {
      return;
    }

    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
    }

    this.resizeTimer = window.setTimeout(() => {
      if (this.cy) {
        this.cy.resize();
      }
      this.resizeTimer = null;
    }, 80);
  }

  private raiseOverlayZIndexForFullscreen() {
    const overlayContainer = this.document.querySelector('.cdk-overlay-container') as HTMLElement | null;
    if (!overlayContainer) {
      return;
    }

    this.overlayContainerEl = overlayContainer;
    this.overlayContainerPrevZIndex = overlayContainer.style.zIndex || '';
    overlayContainer.style.zIndex = '11000';
  }

  private restoreOverlayZIndex() {
    if (!this.overlayContainerEl) {
      return;
    }

    this.overlayContainerEl.style.zIndex = this.overlayContainerPrevZIndex || '';
    this.overlayContainerEl = null;
    this.overlayContainerPrevZIndex = null;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    this.clearPendingTimeouts();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }

    this.destroyCyInstance();

    this.restoreOverlayZIndex();

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
      this.scheduleTimeout(() => {
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

  isUri(value: string): boolean {
    return /^https?:\/\/\S+/.test(value);
  }

  getUriFragment(uri: string): string {
    if (!uri) return 'Unknown';
    
    // Extract the part after the last # or /
    const parts = uri.split(/[#/]/);
    return parts[parts.length - 1] || uri;
  }

  truncateLabel(label: string, max = 50): string {
    if (!label) return label;
    return label.length > max ? label.substring(0, max) + '\u2026' : label;
  }
}