import { Component, EventEmitter, Input, Output, OnInit, OnChanges, SimpleChanges, ViewChildren, QueryList, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormControl, ReactiveFormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ServerSideDataSource, ServerSideDataSourceService } from '../../services/server-side-data-source.service';

export interface UploadInfo {
  status: string;
  message: string;
  graphId: string;
  graphName: string;
  graphUri: string;
  triplesCount: number;
  sparqlEndpoint: string;
  classUri?: string; // Added for server-side pagination
  classesOverview?: Array<{
    label: string;
    instanceCount: number;
    uri: string;
  }>;
  analysisResults?: {
    totalTriples: number;
    classDefinitionsLoaded: number;
    foundClassesCount: number;
    classList: Array<{
      label: string;
      instanceCount: number;
      uri: string;
    }>;
  };
}

export interface TabInfo {
  label: string;
  content: string;
  type: 'text' | 'table' | 'summary';
  data?: any[];
  uploadInfo?: UploadInfo;
}

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTabsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule
  ],
  template: `
    <mat-card class="results-card">
      <mat-card-header>
        <mat-card-title>Knowledge Graph Analysis</mat-card-title>
        <mat-card-subtitle>Analysis results for uploaded TTL data</mat-card-subtitle>
      </mat-card-header>
      
      <mat-card-content>
        <mat-tab-group class="results-tabs" [dynamicHeight]="true">
          <mat-tab 
            *ngFor="let tab of tabs; trackBy: trackByFn" 
            [label]="tab.label">
            
            <!-- Summary View with Classes Overview -->
            <div *ngIf="tab.type === 'summary'" class="summary-content">
              <div class="upload-summary" *ngIf="tab.uploadInfo">
                <div class="result-item">
                  <strong>Status:</strong> 
                  <span class="success">{{ tab.uploadInfo?.status }}</span>
                </div>
                
                <div class="result-item">
                  <strong>Message:</strong> {{ tab.uploadInfo?.message }}
                </div>
                
                <div class="result-item">
                  <strong>Graph Name:</strong> 
                  <code>{{ tab.uploadInfo?.graphId }}</code>
                </div>
                
                <div class="result-item">
                  <strong>Graph URI:</strong> 
                  <code>{{ tab.uploadInfo?.graphUri }}</code>
                </div>
                
                <div class="result-item">
                  <strong>Number of Triples:</strong> 
                  <span class="count">{{ tab.uploadInfo?.triplesCount }}</span>
                </div>
                
                <div class="result-item">
                  <strong>SPARQL Endpoint:</strong> 
                  <a [href]="getSparqlQueryUrl(tab.uploadInfo)" target="_blank">{{ tab.uploadInfo?.sparqlEndpoint }}</a>
                </div>
                
                <div class="result-item" *ngIf="tab.uploadInfo?.analysisResults">
                  <strong>Classes Found:</strong> 
                  <span class="count">{{ tab.uploadInfo?.analysisResults?.foundClassesCount }}</span>
                </div>
              </div>
              
              <div class="content-text">
                <pre>{{ tab.content }}</pre>
              </div>
              
              <!-- Classes Overview Table -->
              <div *ngIf="tab.uploadInfo?.classesOverview?.length" class="classes-overview">
                <h4>Entity Types Summary</h4>
                <p><strong>Total Entity Types:</strong> {{ tab.uploadInfo?.classesOverview?.length }}</p>
                <p><strong>Total Entities:</strong> {{ getTotalEntities(tab.uploadInfo?.classesOverview || []) }}</p>
                <div class="table-container">
                  <table mat-table [dataSource]="getClassesDataSource(tab.uploadInfo?.classesOverview || [])" class="classes-table">
                    <ng-container matColumnDef="label">
                      <th mat-header-cell *matHeaderCellDef>Entity Type</th>
                      <td mat-cell *matCellDef="let element">
                        <strong>{{ element.label }}</strong>
                      </td>
                    </ng-container>
                    
                    <ng-container matColumnDef="count">
                      <th mat-header-cell *matHeaderCellDef>Count</th>
                      <td mat-cell *matCellDef="let element">{{ element.instanceCount }}</td>
                    </ng-container>
                    
                    <tr mat-header-row *matHeaderRowDef="['label', 'count']"></tr>
                    <tr mat-row *matRowDef="let row; columns: ['label', 'count']" class="clickable-row"></tr>
                  </table>
                </div>
              </div>
            </div>
            
            <!-- Table View - Only Label and URI columns -->
            <div *ngIf="tab.type === 'table' && tab.data" class="table-content">
              <div class="table-header">
                <h3>{{ tab.content }}</h3>
                <div class="table-actions">
                  <mat-form-field appearance="outline">
                    <mat-label>Filter</mat-label>
                    <input matInput 
                           [formControl]="getFilterControl(tab)"
                           placeholder="Filter results">
                  </mat-form-field>
                  
                  <!-- Loading spinner for server-side tables -->
                  <mat-spinner 
                    *ngIf="isServerSideDataSource(tab) && (getServerDataSource(tab)?.loading$ | async)"
                    diameter="20">
                  </mat-spinner>
                </div>
              </div>
              
              <div class="table-container">
                <!-- Client-side table -->
                <table mat-table 
                       *ngIf="!isServerSideDataSource(tab)"
                       [dataSource]="getClientDataSource(tab)" 
                       matSort 
                       class="results-table">
                  
                  <!-- Label Column -->
                  <ng-container matColumnDef="label">
                    <th mat-header-cell *matHeaderCellDef mat-sort-header>Label</th>
                    <td mat-cell *matCellDef="let element">
                      <strong>{{ element.label || 'N/A' }}</strong>
                    </td>
                  </ng-container>
                  
                  <!-- URI Column -->
                  <ng-container matColumnDef="uri">
                    <th mat-header-cell *matHeaderCellDef mat-sort-header>URI</th>
                    <td mat-cell *matCellDef="let element">
                      <a [href]="element.uri" target="_blank" 
                         class="uri-link">{{ element.uri }}</a>
                    </td>
                  </ng-container>
                  
                  <tr mat-header-row *matHeaderRowDef="['label', 'uri']"></tr>
                  <tr mat-row *matRowDef="let row; columns: ['label', 'uri'];"></tr>
                </table>
                
                <!-- Server-side table -->
                <table mat-table 
                       *ngIf="isServerSideDataSource(tab) && getServerDataSource(tab)"
                       [dataSource]="getServerDataSource(tab)!" 
                       class="results-table">
                  
                  <!-- Label Column -->
                  <ng-container matColumnDef="label">
                    <th mat-header-cell *matHeaderCellDef>Label</th>
                    <td mat-cell *matCellDef="let element">
                      <strong>{{ element.label || 'N/A' }}</strong>
                    </td>
                  </ng-container>
                  
                  <!-- URI Column -->
                  <ng-container matColumnDef="uri">
                    <th mat-header-cell *matHeaderCellDef>URI</th>
                    <td mat-cell *matCellDef="let element">
                      <a [href]="element.uri" target="_blank" 
                         class="uri-link">{{ element.uri }}</a>
                    </td>
                  </ng-container>
                  
                  <tr mat-header-row *matHeaderRowDef="['label', 'uri']"></tr>
                  <tr mat-row *matRowDef="let row; columns: ['label', 'uri'];"></tr>
                </table>
              </div>
              
              <!-- Client-side paginator -->
              <mat-paginator 
                *ngIf="!isServerSideDataSource(tab)"
                [pageSizeOptions]="[5, 10, 20, 50]" 
                showFirstLastButtons>
              </mat-paginator>
              
              <!-- Server-side paginator -->
              <mat-paginator 
                *ngIf="isServerSideDataSource(tab) && getServerDataSource(tab)"
                [length]="(getServerDataSource(tab)!.pagination$ | async)?.totalItems || 0"
                [pageSize]="(getServerDataSource(tab)!.pagination$ | async)?.pageSize || 50"
                [pageIndex]="((getServerDataSource(tab)!.pagination$ | async)?.page || 1) - 1"
                [pageSizeOptions]="[25, 50, 100, 250]"
                (page)="onPageChange($event, tab)"
                showFirstLastButtons>
              </mat-paginator>
            </div>
            
            <!-- Text View -->
            <div *ngIf="tab.type === 'text'" class="text-content">
              <pre>{{ tab.content }}</pre>
            </div>
            
          </mat-tab>
        </mat-tab-group>
      </mat-card-content>
      
      <mat-card-actions *ngIf="!hideActions">
        <button mat-raised-button color="primary" (click)="newUpload()">
          <mat-icon>add</mat-icon>
          New Upload
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    .results-card {
      margin: 20px 0;
    }
    
    .results-tabs {
      min-height: 400px;
    }
    
    .results-tabs ::ng-deep .mat-mdc-tab-header {
      overflow-x: auto;
      overflow-y: hidden;
    }
    
    .results-tabs ::ng-deep .mat-mdc-tab-label-container {
      overflow: visible;
    }
    
    .summary-content {
      padding: 20px;
    }
    
    .upload-summary {
      background-color: #f5f5f5;
      padding: 16px;
      border-radius: 4px;
      margin-bottom: 20px;
    }
    
    .result-item {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      align-items: center;
    }
    
    .result-item:last-child {
      margin-bottom: 0;
    }
    
    .content-text {
      margin-top: 20px;
    }
    
    .classes-overview {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
    }
    
    .classes-overview h4 {
      margin-bottom: 10px;
      color: #1976d2;
    }
    
    .classes-table {
      width: 100%;
      margin-top: 15px;
    }
    
    .clickable-row {
      cursor: pointer;
    }
    
    .clickable-row:hover {
      background-color: #f5f5f5;
    }
    
    .table-content {
      padding: 20px;
    }
    
    .table-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    
    .table-actions {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    
    .table-container {
      overflow-x: auto;
      margin-bottom: 20px;
    }
    
    .results-table {
      width: 100%;
      min-width: 500px;
    }
    
    .text-content {
      padding: 20px;
      font-family: monospace;
      background-color: #f5f5f5;
      border-radius: 4px;
      margin: 20px;
    }
    
    .success {
      color: #4caf50;
      font-weight: 500;
    }
    
    .count {
      font-weight: bold;
      color: #1976d2;
    }
    
    .uri-link {
      color: #1976d2;
      text-decoration: none;
      font-family: monospace;
      font-size: 0.9em;
    }
    
    .uri-link:hover {
      text-decoration: underline;
    }
    
    code {
      background-color: #e1f5fe;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: monospace;
    }
    
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      font-family: monospace;
      font-size: 14px;
      line-height: 1.4;
    }
  `]
})
export class ResultsComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() results: TabInfo[] = [];
  @Input() hideActions = false;
  @Output() newUploadRequested = new EventEmitter<void>();
  
  tabs: TabInfo[] = [];
  dataSources = new Map<string, MatTableDataSource<any>>();
  serverDataSources = new Map<string, ServerSideDataSource>();
  displayedColumns = new Map<string, string[]>();
  filterControls = new Map<string, FormControl>();
  currentFilters = new Map<string, string>();
  
  @ViewChildren(MatPaginator) paginators!: QueryList<MatPaginator>;
  @ViewChildren(MatSort) sorts!: QueryList<MatSort>;

  constructor(
    private serverSideDataSourceService: ServerSideDataSourceService,
    private http: HttpClient
  ) {}

  ngAfterViewInit() {
    // Connect paginators and sorts to data sources after view initialization
    this.connectPaginatorsAndSorts();
  }

  connectPaginatorsAndSorts() {
    if (this.paginators && this.sorts) {
      let paginatorIndex = 0;
      let sortIndex = 0;
      
      this.tabs.forEach(tab => {
        if (tab.type === 'table' && tab.data) {
          const dataSource = this.dataSources.get(tab.label);
          if (dataSource) {
            const paginator = this.paginators.toArray()[paginatorIndex];
            const sort = this.sorts.toArray()[sortIndex];
            
            if (paginator) {
              dataSource.paginator = paginator;
              paginatorIndex++;
            }
            
            if (sort) {
              dataSource.sort = sort;
              sortIndex++;
            }
          }
        }
      });
    }
  }

  ngOnInit() {
    this.updateTabs();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['results']) {
      this.updateTabs();
    }
  }

  updateTabs() {
    this.tabs = this.results || [];
    this.initializeDataSources();
  }

  trackByFn(index: number, item: TabInfo): string {
    return item.label;
  }

  initializeDataSources() {
    this.tabs.forEach(tab => {
      if (tab.type === 'table' && tab.data) {
        // For all table tabs, enforce Label and URI columns only
        this.displayedColumns.set(tab.label, ['label', 'uri']);
        
        // Check if this tab should use server-side pagination
        if (this.shouldUseServerSidePagination(tab)) {
          this.setupServerSideDataSource(tab);
        } else {
          this.setupClientSideDataSource(tab);
        }
        
        // Setup filter control for this tab
        const filterControl = new FormControl('');
        this.filterControls.set(tab.label, filterControl);
        
        // Setup filter debouncing
        filterControl.valueChanges.pipe(
          debounceTime(300),
          distinctUntilChanged()
        ).subscribe(filterValue => {
          this.applyFilter(filterValue || '', tab);
        });
      }
    });
    
    // Re-connect paginators and sorts if they're already available
    setTimeout(() => this.connectPaginatorsAndSorts(), 0);
  }

  shouldUseServerSidePagination(tab: TabInfo): boolean {
    // Use server-side pagination if:
    // 1. The tab has uploadInfo with classUri (indicating it's a class instance table)
    // 2. OR the data array has more than 100 items (arbitrary threshold)
    const hasClassUri = !!(tab.uploadInfo && tab.uploadInfo.classUri);
    const hasLargeDataset = !!(tab.data && tab.data.length > 100);
    return hasClassUri || hasLargeDataset;
  }

  setupServerSideDataSource(tab: TabInfo) {
    const serverDataSource = this.serverSideDataSourceService.createDataSource();
    this.serverDataSources.set(tab.label, serverDataSource);
    
    // Load initial data if we have the necessary information
    if (tab.uploadInfo?.graphName && tab.uploadInfo?.classUri) {
      serverDataSource.loadData(tab.uploadInfo.graphName, tab.uploadInfo.classUri, 1, 50, '');
    }
  }

  setupClientSideDataSource(tab: TabInfo) {
    const dataSource = new MatTableDataSource(tab.data);
    this.dataSources.set(tab.label, dataSource);
    
    // Set up filter predicate for label field only
    dataSource.filterPredicate = (data: any, filter: string) => {
      const filterValue = filter.toLowerCase();
      return data.label && data.label.toString().toLowerCase().includes(filterValue);
    };
  }

  getDataSource(tab: TabInfo): MatTableDataSource<any> | ServerSideDataSource {
    // Return server-side data source if available, otherwise client-side
    return this.serverDataSources.get(tab.label) || 
           this.dataSources.get(tab.label) || 
           new MatTableDataSource<any>([]);
  }

  isServerSideDataSource(tab: TabInfo): boolean {
    return this.serverDataSources.has(tab.label);
  }

  getClientDataSource(tab: TabInfo): MatTableDataSource<any> {
    return this.dataSources.get(tab.label) || new MatTableDataSource<any>([]);
  }

  getServerDataSource(tab: TabInfo): ServerSideDataSource | null {
    return this.serverDataSources.get(tab.label) || null;
  }

  getDisplayedColumns(tab: TabInfo): string[] {
    // Always return label and uri for table tabs
    return ['label', 'uri'];
  }

  getColumnLabel(column: string): string {
    if (column === 'label') return 'Label';
    if (column === 'uri') return 'URI';
    return column.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  }

  applyFilter(filterValue: string, tab: TabInfo) {
    this.currentFilters.set(tab.label, filterValue);
    
    if (this.isServerSideDataSource(tab)) {
      // Server-side filtering
      const serverDataSource = this.getServerDataSource(tab);
      if (serverDataSource && tab.uploadInfo?.graphName && tab.uploadInfo?.classUri) {
        serverDataSource.loadData(
          tab.uploadInfo.graphName,
          tab.uploadInfo.classUri,
          1, // Reset to first page
          50, // Default page size
          filterValue
        );
      }
    } else {
      // Client-side filtering
      const clientDataSource = this.getClientDataSource(tab);
      if (clientDataSource) {
        clientDataSource.filter = filterValue.trim().toLowerCase();
      }
    }
  }

  onPageChange(event: PageEvent, tab: TabInfo) {
    if (this.isServerSideDataSource(tab)) {
      const serverDataSource = this.getServerDataSource(tab);
      const currentFilter = this.currentFilters.get(tab.label) || '';
      
      if (serverDataSource && tab.uploadInfo?.graphName && tab.uploadInfo?.classUri) {
        serverDataSource.loadData(
          tab.uploadInfo.graphName,
          tab.uploadInfo.classUri,
          event.pageIndex + 1, // Convert to 1-based page number
          event.pageSize,
          currentFilter
        );
      }
    }
    // Client-side pagination is handled automatically by MatPaginator
  }

  getFilterControl(tab: TabInfo): FormControl {
    return this.filterControls.get(tab.label) || new FormControl('');
  }

  getClassesDataSource(classesData: any[]): MatTableDataSource<any> {
    return new MatTableDataSource(classesData);
  }

  getTotalEntities(classesData: any[]): number {
    return classesData.reduce((total, cls) => total + (cls.instanceCount || 0), 0);
  }

  getSparqlQueryUrl(uploadInfo: any): string {
    if (!uploadInfo?.graphId) {
      return uploadInfo?.sparqlEndpoint || '';
    }

    const graphName = uploadInfo.graphId;
    const graphUri = uploadInfo.graphUri || `http://localhost:8080/graph/${graphName}`;
    
    const sparqlQuery = `select * from <${graphUri}>
where {
?s ?p ?o
}
LIMIT 1000`;
    
    const encodedQuery = encodeURIComponent(sparqlQuery);
    return `${uploadInfo.sparqlEndpoint}?query=${encodedQuery}`;
  }

  newUpload() {
    this.newUploadRequested.emit();
  }
}