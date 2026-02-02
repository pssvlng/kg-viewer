import { Component, EventEmitter, Input, Output, OnInit, OnChanges, SimpleChanges, ViewChildren, ViewChild, QueryList, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormControl, ReactiveFormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule, MatTabGroup } from '@angular/material/tabs';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, distinctUntilChanged, timeout, take } from 'rxjs/operators';
import { ServerSideDataSource, ServerSideDataSourceService } from '../../services/server-side-data-source.service';
import { DocumentService } from '../../services/document.service';
import { GraphsService } from '../../services/graphs.service';
import { environment } from '../../../environments/environment';
import { ContentNavigable, ContentNavigationEvent } from '../../services/content-navigation.interface';
import { GraphViewerComponent } from '../graph-viewer/graph-viewer.component';

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
  type: 'text' | 'table' | 'summary' | 'search';
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
    MatProgressSpinnerModule,
    MatTooltipModule
  ],
  template: `
    <mat-card class="results-card">
      <mat-card-header>
        <mat-card-title>Knowledge Graph Analysis</mat-card-title>
        <mat-card-subtitle>Analysis Results For Uploaded TTL Data</mat-card-subtitle>
      </mat-card-header>
      
      <mat-card-content>
        <mat-tab-group #tabGroup class="results-tabs" [dynamicHeight]="true">
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
                  <strong>Graph Name:</strong> {{ tab.uploadInfo?.graphName }}
                </div>
                
                <div class="result-item">
                  <strong>Graph URI:</strong> 
                  <a [href]="tab.uploadInfo?.graphUri" target="_blank" class="graph-link">{{ tab.uploadInfo?.graphUri }}</a>
                </div>
                
                <div class="result-item">
                  <strong>Total Triples:</strong> {{ tab.uploadInfo?.triplesCount | number }}
                </div>
                
                <div class="result-item">
                  <strong>SPARQL Endpoint:</strong> 
                  <a [href]="getSparqlQueryUrl(tab.uploadInfo)" target="_blank" class="sparql-link">{{ getPublicSparqlEndpoint(tab.uploadInfo?.sparqlEndpoint) }}</a>
                </div>
              </div>
              
              <!-- Analysis Results Section -->
              <div *ngIf="tab.uploadInfo?.analysisResults" class="analysis-summary">
                <h4>Analysis Results</h4>
                
                <div class="analysis-stats">
                  <div class="stat-item">
                    <strong>Total Triples:</strong> {{ tab.uploadInfo?.analysisResults?.totalTriples | number }}
                  </div>
                  
                  <div class="stat-item">
                    <strong>Entity Types Found:</strong> {{ tab.uploadInfo?.analysisResults?.foundClassesCount }}
                  </div>
                </div>
                
                <!-- Entity Types Overview -->
                <div *ngIf="tab.uploadInfo?.analysisResults?.classList" class="classes-overview">
                  <h5>Entity Types Overview</h5>
                  <div class="table-container">
                    <table mat-table [dataSource]="getEntityTypesDataSource(tab.uploadInfo?.analysisResults?.classList || [])" 
                           class="classes-table">
                      
                      <!-- Entity Name Column -->
                      <ng-container matColumnDef="name">
                        <th mat-header-cell *matHeaderCellDef>Entity Type</th>
                        <td mat-cell *matCellDef="let element"
                            [class.clickable-row]="enableEntityNavigation"
                            (click)="enableEntityNavigation && navigateToEntityType(element.label, element.instanceCount)">
                          {{ element.label }}
                        </td>
                      </ng-container>
                      
                      <!-- Instance Count Column -->
                      <ng-container matColumnDef="count">
                        <th mat-header-cell *matHeaderCellDef>Instances</th>
                        <td mat-cell *matCellDef="let element">{{ element.instanceCount | number }}</td>
                      </ng-container>
                      
                      <tr mat-header-row *matHeaderRowDef="['name', 'count']"></tr>
                      <tr mat-row *matRowDef="let row; columns: ['name', 'count'];"
                          [class.clickable-row]="enableEntityNavigation"></tr>
                    </table>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Search View -->
            <div *ngIf="tab.type === 'search'" class="search-content">
              <div class="search-header">
                <mat-form-field appearance="outline" class="search-input">
                  <mat-label>Search Knowledge Graph</mat-label>
                  <input matInput 
                         #searchInput
                         placeholder="Search object literals..."
                         (keyup.enter)="triggerSearch(tab, searchInput.value)">
                  <button mat-icon-button 
                          matSuffix 
                          (click)="triggerSearch(tab, searchInput.value)"
                          matTooltip="Search">
                    <mat-icon>search</mat-icon>
                  </button>
                  <button mat-icon-button 
                          matSuffix 
                          (click)="clearSearch(tab, searchInput)"
                          matTooltip="Clear"
                          *ngIf="searchInput.value">
                    <mat-icon>close</mat-icon>
                  </button>
                </mat-form-field>
              </div>
              
              <!-- Loading Spinner -->
              <div *ngIf="isSearchLoading(tab)" class="search-loading">
                <mat-progress-spinner mode="indeterminate" diameter="50"></mat-progress-spinner>
                <p>Searching, please be patient....</p>
              </div>
              
              <!-- Search Results -->
              <div *ngIf="hasSearchResults(tab) && !isSearchLoading(tab)" class="search-results">
                <div class="table-container">
                  <table mat-table 
                         *ngIf="getSearchDataSource(tab)"
                         [dataSource]="getSearchDataSource(tab)!" 
                         class="search-table">
                    
                    <!-- Subject Column -->
                    <ng-container matColumnDef="subject">
                      <th mat-header-cell *matHeaderCellDef>Subject</th>
                      <td mat-cell *matCellDef="let element">
                        <a [href]="element.subject" 
                           target="_blank"
                           [matTooltip]="element.subject" 
                           matTooltipPosition="above"
                           class="truncated-uri clickable-link">
                          {{ truncateUri(element.subject) }}
                        </a>
                      </td>
                    </ng-container>
                    
                    <!-- Predicate Column -->
                    <ng-container matColumnDef="predicate">
                      <th mat-header-cell *matHeaderCellDef>Predicate</th>
                      <td mat-cell *matCellDef="let element">
                        <a [href]="element.predicate" 
                           target="_blank"
                           [matTooltip]="element.predicate" 
                           matTooltipPosition="above"
                           class="truncated-uri clickable-link">
                          {{ truncateUri(element.predicate) }}
                        </a>
                      </td>
                    </ng-container>
                    
                    <!-- Object Column -->
                    <ng-container matColumnDef="object">
                      <th mat-header-cell *matHeaderCellDef>Object</th>
                      <td mat-cell *matCellDef="let element">
                        <span [matTooltip]="element.object" 
                              matTooltipPosition="above"
                              class="truncated-uri">
                          {{ truncateUri(element.object) }}
                        </span>
                      </td>
                    </ng-container>
                    
                    <!-- Actions Column -->
                    <ng-container matColumnDef="actions" *ngIf="!hideActions">
                      <th mat-header-cell *matHeaderCellDef>Actions</th>
                      <td mat-cell *matCellDef="let element">
                        <button mat-icon-button 
                                (click)="viewSearchResultGraph(element, tab)"
                                matTooltip="View"
                                matTooltipPosition="above"
                                color="primary">
                          <mat-icon>visibility</mat-icon>
                        </button>
                      </td>
                    </ng-container>
                    
                    <tr mat-header-row *matHeaderRowDef="getSearchDisplayedColumns()"></tr>
                    <tr mat-row *matRowDef="let row; columns: getSearchDisplayedColumns();"></tr>
                  </table>
                </div>
                
                <!-- Search Paginator -->
                <mat-paginator 
                  *ngIf="getSearchDataSource(tab) && !isSearchLoading(tab)"
                  [length]="getSearchResultCount(tab)"
                  [pageIndex]="getSearchPageIndex(tab)"
                  [pageSize]="getSearchPageSize(tab)"
                  [pageSizeOptions]="[25, 50, 100, 250]"
                  (page)="onSearchPageChange($event, tab)"
                  showFirstLastButtons>
                </mat-paginator>
                

              </div>
              
              <!-- No results message -->
              <div *ngIf="hasSearched(tab) && !hasSearchResults(tab) && !isSearchLoading(tab)" 
                   class="no-results">
                <mat-icon>search_off</mat-icon>
                <p>No results found or request timed out.</p>
              </div>
            </div>
            
            <!-- Table View - Only Label and URI columns -->
            <div *ngIf="tab.type === 'table' && tab.data" class="table-content">
              <div class="table-header">
                <h3>{{ tab.content }}</h3>
                <div class="table-actions">
                  <mat-form-field appearance="outline">
                    <mat-label>Filter Results</mat-label>
                    <input matInput 
                           #filterInput
                           placeholder="Enter filter term and press Enter or click search"
                           (keyup.enter)="triggerFilter(tab, filterInput.value)">
                    <button mat-icon-button 
                            matSuffix 
                            (click)="triggerFilter(tab, filterInput.value)"
                            matTooltip="Filter">
                      <mat-icon>search</mat-icon>
                    </button>
                    <button mat-icon-button 
                            matSuffix 
                            (click)="clearFilter(tab, filterInput)"
                            matTooltip="Clear Filter"
                            *ngIf="filterInput.value">
                      <mat-icon>close</mat-icon>
                    </button>
                  </mat-form-field>
                  
                  <!-- Loading spinner for server-side tables and filtering -->
                  <mat-spinner 
                    *ngIf="(isServerSideDataSource(tab) && (getServerDataSource(tab)?.loading$ | async)) || isFilterLoading(tab)"
                    diameter="20">
                  </mat-spinner>
                </div>
                
                <!-- Filter Loading Message -->
                <div *ngIf="isFilterLoading(tab)" class="filter-loading">
                  <p>Filtering, please be patient...</p>
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
                  
                  <!-- Actions Column -->
                  <ng-container matColumnDef="actions" *ngIf="!hideActions">
                    <th mat-header-cell *matHeaderCellDef>Actions</th>
                    <td mat-cell *matCellDef="let element">
                      <button mat-icon-button 
                              (click)="viewEntityGraph(element, tab)"
                              matTooltip="View"
                              matTooltipPosition="above"
                              title="View"
                              color="primary">
                        <mat-icon>visibility</mat-icon>
                      </button>
                    </td>
                  </ng-container>
                  
                  <tr mat-header-row *matHeaderRowDef="getDisplayedColumns(tab)"></tr>
                  <tr mat-row *matRowDef="let row; columns: getDisplayedColumns(tab);"></tr>
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
                      <strong>{{ element.label || element.instanceLabel || 'N/A' }}</strong>
                    </td>
                  </ng-container>
                  
                  <!-- URI Column -->
                  <ng-container matColumnDef="uri">
                    <th mat-header-cell *matHeaderCellDef>URI</th>
                    <td mat-cell *matCellDef="let element">
                      <a [href]="element.uri || element.instance" 
                         target="_blank" 
                         [matTooltip]="element.uri || element.instance" 
                         matTooltipPosition="above"
                         class="uri-link truncated-uri">
                        {{ truncateUri(element.uri || element.instance) }}
                      </a>
                    </td>
                  </ng-container>
                  
                  <!-- Actions Column -->
                  <ng-container matColumnDef="actions" *ngIf="!hideActions">
                    <th mat-header-cell *matHeaderCellDef>Actions</th>
                    <td mat-cell *matCellDef="let element">
                      <button mat-icon-button 
                              (click)="viewEntityGraph(element, tab)"
                              matTooltip="View"
                              matTooltipPosition="above"
                              title="View"
                              color="primary">
                        <mat-icon>visibility</mat-icon>
                      </button>
                    </td>
                  </ng-container>
                  

                  <tr mat-header-row *matHeaderRowDef="getDisplayedColumns(tab)"></tr>
                  <tr mat-row *matRowDef="let row; columns: getDisplayedColumns(tab);"></tr>
                </table>
                
                <!-- Message display outside table but styled to look like a table row -->
                <div *ngIf="getServerDataSource(tab)?.message$ | async as message" class="table-message-row">
                  <div class="table-message">
                    {{ message }}
                  </div>
                </div>
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
                [pageSize]="(getServerDataSource(tab)!.pagination$ | async)?.pageSize || 25"
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
      
      <mat-card-actions *ngIf="showNewUploadButton">
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
    
    .classes-overview h4, .classes-overview h5 {
      margin-bottom: 10px;
      color: #1976d2;
    }
    
    .classes-table {
      width: 100%;
      margin-top: 15px;
    }
    
    .classes-table .mat-mdc-row {
      transition: background-color 0.2s ease;
    }
    
    .clickable-row {
      cursor: pointer;
    }
    
    .clickable-row:hover {
      background-color: #f5f5f5 !important;
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
    
    .clear-icon {
      cursor: pointer;
      color: #666;
      font-size: 18px;
    }
    
    .clear-icon:hover {
      color: #333;
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
    
    .search-content {
      padding: 20px;
    }
    
    .search-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    
    .search-input {
      width: 100%;
      max-width: 600px;
    }
    
    .search-input .mat-mdc-form-field-flex {
      align-items: center;
    }
    
    .search-results {
      margin-top: 20px;
    }
    
    .search-table {
      width: 100%;
    }
    
    .truncated-uri {
      display: inline-block;
      max-width: 250px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: monospace;
      font-size: 0.9em;
      color: #1976d2;
    }
    
    .clickable-link {
      text-decoration: none;
      cursor: pointer;
    }
    
    .clickable-link:hover {
      text-decoration: underline;
    }
    
    .no-results {
      text-align: center;
      padding: 40px 20px;
      color: #666;
    }
    
    .no-results mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #999;
      margin-bottom: 10px;
    }
    
    .search-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px;
      color: #666;
    }
    
    .search-loading mat-progress-spinner {
      margin-bottom: 16px;
    }
    
    .search-summary {
      padding: 16px;
      background-color: #f5f5f5;
      border-radius: 4px;
      margin-top: 16px;
      text-align: center;
      color: #666;
      font-size: 14px;
    }
    
    .server-message {
      padding: 12px 16px;
      background-color: #fff3cd;
      border: 1px solid #ffeaa7;
      border-radius: 4px;
      margin-bottom: 16px;
    }
    
    .limit-message {
      margin: 0;
      color: #856404;
      font-size: 14px;
      font-weight: 500;
    }
    
    .message-cell {
      text-align: center;
      padding: 16px !important;
      background-color: #fff3cd;
      border-top: 1px solid #ffeaa7;
    }
    
    .table-message {
      color: #856404;
      font-size: 14px;
      font-weight: 500;
      padding: 8px;
    }
    
    .table-message-row {
      background-color: #fff3cd;
      border: 1px solid #ffeaa7;
      border-top: none;
      text-align: center;
      padding: 12px;
      margin-bottom: 16px;
    }
  `]
})
export class ResultsComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy, ContentNavigable {
  @Input() results: TabInfo[] = [];
  @Input() hideActions = false;
  @Input() isInContainer = false; // New flag to detect container usage
  @Input() summaryOnly: boolean = false; // Only show summary tab
  @Input() enableEntityNavigation: boolean = true; // Enable entity type clicking
  @Input() showNewUploadButton: boolean = true; // Control New Upload button visibility
  @Input() restoreState: any = null; // State to restore when coming back from navigation
  @Input() graphInfo: any = null; // Current graph context for search
  @Output() newUploadRequested = new EventEmitter<void>();
  @Output() contentNavigation = new EventEmitter<ContentNavigationEvent>();
  @Output() viewEntityGraphRequested = new EventEmitter<any>();
  
  tabs: TabInfo[] = [];
  dataSources = new Map<string, MatTableDataSource<any>>();
  serverDataSources = new Map<string, ServerSideDataSource>();
  searchDataSources = new Map<string, MatTableDataSource<any>>();
  searchStates = new Map<string, { hasSearched: boolean, lastSearchTerm?: string, isLoading?: boolean, pageIndex?: number, pageSize?: number }>();
  searchLoadingSubscriptions = new Map<string, any>();
  displayedColumns = new Map<string, string[]>();
  filterControls = new Map<string, FormControl>();
  filterStates = new Map<string, { isLoading: boolean; lastFilterTerm?: string }>();
  currentFilters = new Map<string, string>();
  configuredSparqlEndpoint = 'http://localhost:8890/sparql'; // fallback
  availableGraphs: string[] = []; // Store available graph names
  
  @ViewChildren(MatPaginator) paginators!: QueryList<MatPaginator>;
  @ViewChildren(MatSort) sorts!: QueryList<MatSort>;
  @ViewChild('tabGroup') tabGroup!: MatTabGroup;

  constructor(
    private serverSideDataSourceService: ServerSideDataSourceService,
    private http: HttpClient,
    private documentService: DocumentService,
    private graphsService: GraphsService
  ) {
  }



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
    this.loadConfiguration();
    this.loadAvailableGraphs();
    this.updateTabs();
  }

  async loadConfiguration() {
    try {
      // Get configuration from the backend
      const response = await this.http.get<any>(`${environment.apiUrl}/api/config`).toPromise();
      const config = response?.config;
      
      // Use external_virtuoso_url if available, otherwise fall back to localhost
      if (config?.external_virtuoso_url) {
        this.configuredSparqlEndpoint = `${config.external_virtuoso_url}/sparql`;
      } else if (config?.virtuoso_url) {
        // Convert internal URL to external URL
        this.configuredSparqlEndpoint = config.virtuoso_url.replace('http://virtuoso:8890', 'http://localhost:8890') + '/sparql';
      } else {
        this.configuredSparqlEndpoint = 'http://localhost:8890/sparql';
      }
    } catch (error) {
      console.warn('Failed to fetch configuration, using fallback SPARQL endpoint:', error);
      this.configuredSparqlEndpoint = 'http://localhost:8890/sparql';
    }
  }

  async loadAvailableGraphs() {
    try {
      this.graphsService.getGraphs().subscribe(response => {
        if (response.success && response.graphs) {
          this.availableGraphs = response.graphs.map(graph => graph.name);
          console.log('Available graphs loaded:', this.availableGraphs);
        }
      });
    } catch (error) {
      console.warn('Failed to load available graphs:', error);
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    // Handle state restoration when coming back from navigation
    if (changes['restoreState'] && this.restoreState?.currentTabIndex !== undefined) {
      this.restoreTabState(this.restoreState.currentTabIndex);
    }
    
    // Handle results changes
    if (changes['results']) {
      this.updateTabs();
    }
  }

  updateTabs() {
    // Ensure results is an array before processing
    const resultsArray = Array.isArray(this.results) ? this.results : [];
    this.tabs = this.sortTabs(resultsArray);
    this.initializeDataSources();
  }

  private sortTabs(tabs: TabInfo[]): TabInfo[] {
    // Safety check: ensure tabs is an array
    if (!Array.isArray(tabs)) {
      console.warn('sortTabs received non-array:', tabs);
      return [];
    }
    
    const summaryTab = tabs.filter(tab => tab.type === 'summary');
    
    // If summaryOnly is true, return only summary tabs
    if (this.summaryOnly) {
      return summaryTab;
    }
    
    const searchTab = tabs.filter(tab => tab.type === 'search');
    const entityTabs = tabs.filter(tab => tab.type === 'table');
    const owlTabs = tabs.filter(tab => tab.label.startsWith('owl#'));
    const otherTabs = tabs.filter(tab => 
      tab.type !== 'summary' && 
      tab.type !== 'search' && 
      tab.type !== 'table' && 
      !tab.label.startsWith('owl#')
    );
    
    // Return in new order: Summary → Search → Entity Types → Other → owl#
    return [...summaryTab, ...searchTab, ...entityTabs, ...otherTabs, ...owlTabs];
  }

  navigateToEntityType(entityLabel: string, instanceCount?: number) {
    // Find the tab for this entity type and switch to it
    // Look for exact match first, then try with instance count
    let tabIndex = this.tabs.findIndex(tab => tab.label === entityLabel);
    
    if (tabIndex === -1 && instanceCount !== undefined) {
      // Try finding with instance count format
      const labelWithCount = `${entityLabel} (${instanceCount})`;
      tabIndex = this.tabs.findIndex(tab => tab.label === labelWithCount);
    }
    
    if (tabIndex !== -1 && this.tabGroup) {
      this.tabGroup.selectedIndex = tabIndex;
    }
  }

  getEntityTypesDataSource(classList: any[] | undefined): MatTableDataSource<any> {
    return new MatTableDataSource(classList || []);
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
        
        // Setup filter control for this tab (no debouncing)
        const filterControl = new FormControl('');
        this.filterControls.set(tab.label, filterControl);
        
        // Initialize filter state
        this.filterStates.set(tab.label, { isLoading: false });
      } else if (tab.type === 'search') {
        // Initialize search state for search tabs
        this.searchStates.set(tab.label, { hasSearched: false, isLoading: false, pageIndex: 0, pageSize: 25 });
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
    
    // Load initial data with 25 items per page if we have the necessary information
    if (tab.uploadInfo?.graphName && tab.uploadInfo?.classUri) {
      serverDataSource.loadData(tab.uploadInfo.graphName, tab.uploadInfo.classUri, 1, 25, '');
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

  // Remove the shouldShowMessage method - we'll use a different approach

  getDisplayedColumns(tab: TabInfo): string[] {
    // Return conditional columns based on hideActions
    return this.hideActions ? ['label', 'uri'] : ['label', 'uri', 'actions'];
  }

  getColumnLabel(column: string): string {
    if (column === 'label') return 'Label';
    if (column === 'uri') return 'URI';
    if (column === 'actions') return 'Actions';
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
          25, // Default page size
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

  clearFilter(tab: TabInfo, filterInput?: any) {
    if (filterInput) {
      filterInput.value = '';
    }
    const filterControl = this.getFilterControl(tab);
    filterControl.setValue('');
    
    // Reset filter state
    this.filterStates.set(tab.label, { isLoading: false });
    
    // Apply empty filter to show all records
    this.applyFilter('', tab);
  }
  
  triggerFilter(tab: TabInfo, filterTerm?: string) {
    const term = filterTerm?.trim();
    if (!term) {
      // If empty, clear the filter
      this.clearFilter(tab);
      return;
    }
    
    // Set loading state
    this.filterStates.set(tab.label, { isLoading: true, lastFilterTerm: term });
    
    // Add small delay to show loading state, then apply filter
    setTimeout(() => {
      this.applyFilter(term, tab);
      // Clear loading state after filter is applied
      this.filterStates.set(tab.label, { isLoading: false, lastFilterTerm: term });
    }, 100);
  }
  
  isFilterLoading(tab: TabInfo): boolean {
    return this.filterStates.get(tab.label)?.isLoading || false;
  }

  getClassesDataSource(classesData: any[]): MatTableDataSource<any> {
    const sortedClasses = this.sortEntityTypes(classesData);
    return new MatTableDataSource(sortedClasses);
  }

  private sortEntityTypes(entityTypes: any[]): any[] {
    // Separate entity types into two groups: owl# types and others
    const owlTypes = entityTypes.filter(entityType => entityType.label && entityType.label.startsWith('owl#'));
    const otherTypes = entityTypes.filter(entityType => !entityType.label || !entityType.label.startsWith('owl#'));
    
    // Return other types first, then owl# types
    return [...otherTypes, ...owlTypes];
  }

  getTotalEntities(classesData: any[]): number {
    return classesData.reduce((total, cls) => total + (cls.instanceCount || 0), 0);
  }

  getPublicSparqlEndpoint(sparqlEndpoint: string | undefined): string {
    // Use the configured endpoint instead of the one from uploadInfo
    // The uploadInfo might contain internal docker URLs
    return this.configuredSparqlEndpoint;
  }

  async getConfiguredSparqlEndpoint(): Promise<string> {
    return this.configuredSparqlEndpoint;
  }

  getSparqlQueryUrl(uploadInfo: any): string {
    if (!uploadInfo?.graphId) {
      return this.configuredSparqlEndpoint;
    }

    const graphName = uploadInfo.graphId;
    const graphUri = uploadInfo.graphUri || `http://localhost:8080/graph/${graphName}`;
    
    const sparqlQuery = `select * from <${graphUri}>
where {
?s ?p ?o
}
LIMIT 1000`;
    
    const encodedQuery = encodeURIComponent(sparqlQuery);
    return `${this.configuredSparqlEndpoint}?qtxt=${encodedQuery}`;
  }

  navigateToEntityTab(entityLabel: string, instanceCount: number) {
    // Find the tab that matches this entity type
    const targetTabLabel = `${entityLabel} (${instanceCount})`;
    const tabIndex = this.tabs.findIndex(tab => tab.label === targetTabLabel);
    
    if (tabIndex !== -1 && this.tabGroup) {
      this.tabGroup.selectedIndex = tabIndex;
    }
  }

  viewEntityGraph(element: any, tab: TabInfo) {
    const graphName = this.extractGraphName(tab);
    
    if (this.isInContainer) {
      // Use container navigation - preserve current results state
      this.contentNavigation.emit({
        action: 'push',
        component: GraphViewerComponent,
        data: {
          entityUri: element.uri,
          entityLabel: element.label,
          graphName: graphName,
          // Store the current results state to restore when coming back
          preserveState: {
            results: this.results,
            currentTabIndex: this.getCurrentTabIndex()
          }
        },
        title: `Graph: ${element.label || 'Entity'}`
      });
    } else {
      // Simple approach: emit event for parent component to handle visibility
      this.viewEntityGraphRequested.emit({
        entityUri: element.uri,
        entityLabel: element.label,
        graphName: graphName
      });
    }
  }

  private getCurrentTabIndex(): number {
    return this.tabGroup?.selectedIndex ?? 0;
  }

  private restoreTabState(tabIndex: number) {
    if (this.tabGroup && tabIndex >= 0 && tabIndex < this.results.length) {
      // Use setTimeout to ensure view is updated
      setTimeout(() => {
        this.tabGroup.selectedIndex = tabIndex;
      }, 0);
    }
  }

  private extractGraphName(tab: TabInfo): string {
    // First try to get graph name from tab's upload info
    let graphName = tab.uploadInfo?.graphName || tab.uploadInfo?.graphId;
    
    // If no graph name in tab, use the current graph context (for viewing existing graphs)
    if ((!graphName || graphName === 'default') && this.graphInfo) {
      graphName = this.graphInfo.name;
      console.log(`Using current graph context for search: ${graphName}`);
    }
    
    // If still no graph name found, use the first available graph
    if (!graphName || graphName === 'default') {
      if (this.availableGraphs.length > 0) {
        const firstGraph = this.availableGraphs[0];
        console.warn(`No valid graph name found for search. Using first available graph: ${firstGraph}. Available graphs: ${this.availableGraphs.join(', ')}`);
        return firstGraph;
      } else {
        console.error('No graphs available for search. Please ensure graphs are loaded.');
        return 'default'; // Fallback
      }
    }
    
    return graphName;
  }

  newUpload() {
    this.newUploadRequested.emit();
  }

  // Search functionality methods - completely non-reactive, no state tracking
  triggerSearch(tab: TabInfo, searchTerm?: string): void {
    const term = searchTerm?.trim();
    if (!term) {
      console.log('No search term provided');
      return;
    }

    console.log('Trigger search for term:', term);
    this.performSearch(term, tab);
  }

  clearSearch(tab: TabInfo, inputElement?: HTMLInputElement): void {
    // Clear the input element if provided
    if (inputElement) {
      inputElement.value = '';
    }
    
    // Clear search data and state
    this.searchDataSources.delete(tab.label);
    this.searchStates.set(tab.label, { 
      hasSearched: false, 
      lastSearchTerm: undefined,
      pageIndex: 0,
      pageSize: 25
    });
  }

  performSearch(searchTerm: string, tab: TabInfo) {
    if (!searchTerm.trim()) {
      return;
    }
    
    const graphName = this.extractGraphName(tab);
    const url = `${environment.apiUrl}/api/graphs/${encodeURIComponent(graphName)}/search`;
    
    // Set loading state
    this.searchStates.set(tab.label, { 
      hasSearched: true, 
      lastSearchTerm: searchTerm,
      isLoading: true
    });
    
    this.http.get<any>(url, {
      params: { q: searchTerm }
    }).pipe(
      timeout(30000) // 30 second timeout
    ).subscribe({
      next: (response) => {
        // Create MatTableDataSource with results
        const dataSource = new MatTableDataSource(response.results || []);
        this.searchDataSources.set(tab.label, dataSource);
        
        // Update state
        this.searchStates.set(tab.label, { 
          hasSearched: true, 
          lastSearchTerm: searchTerm,
          isLoading: false,
          pageIndex: 0,
          pageSize: 25
        });
      },
      error: (error) => {
        console.error('Search error:', error);
        this.searchDataSources.delete(tab.label);
        this.searchStates.set(tab.label, { 
          hasSearched: true, 
          lastSearchTerm: searchTerm,
          isLoading: false,
          pageIndex: 0,
          pageSize: 25
        });
      }
    });
  }

  hasSearchResults(tab: TabInfo): boolean {
    const dataSource = this.searchDataSources.get(tab.label);
    return !!(dataSource && dataSource.data && dataSource.data.length > 0);
  }

  isSearchLoading(tab: TabInfo): boolean {
    const searchState = this.searchStates.get(tab.label);
    return searchState?.isLoading === true;
  }

  hasSearched(tab: TabInfo): boolean {
    const state = this.searchStates.get(tab.label);
    return state?.hasSearched || false;
  }

  getSearchResultCount(tab: TabInfo): number {
    const dataSource = this.searchDataSources.get(tab.label);
    return dataSource && dataSource.data ? dataSource.data.length : 0;
  }

  getSearchPageIndex(tab: TabInfo): number {
    const searchState = this.searchStates.get(tab.label);
    return searchState?.pageIndex || 0;
  }

  getSearchPageSize(tab: TabInfo): number {
    const searchState = this.searchStates.get(tab.label);
    return searchState?.pageSize || 25;
  }

  getTotalSearchResults(tab: TabInfo): number {
    return this.getSearchResultCount(tab);
  }

  getSearchDataSource(tab: TabInfo): MatTableDataSource<any> | null {
    const fullDataSource = this.searchDataSources.get(tab.label);
    if (!fullDataSource) return null;
    
    // Get pagination state
    const searchState = this.searchStates.get(tab.label);
    const pageIndex = searchState?.pageIndex || 0;
    const pageSize = searchState?.pageSize || 25;
    
    // Create a new data source with paginated data
    const startIndex = pageIndex * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = fullDataSource.data.slice(startIndex, endIndex);
    
    const paginatedDataSource = new MatTableDataSource(paginatedData);
    return paginatedDataSource;
  }
  
  onSearchPageChange(event: PageEvent, tab: TabInfo) {
    console.log('Search page change:', event);
    const currentState = this.searchStates.get(tab.label);
    if (currentState) {
      this.searchStates.set(tab.label, {
        ...currentState,
        pageIndex: event.pageIndex,
        pageSize: event.pageSize
      });
    }
  }

  getSearchDisplayedColumns(): string[] {
    return this.hideActions ? ['subject', 'predicate', 'object'] : ['subject', 'predicate', 'object', 'actions'];
  }

  // Pagination is now handled automatically by MatPaginator + MatTableDataSource
  
  // Manual pagination for search results - implemented above in getSearchDataSource

  viewSearchResultGraph(result: any, tab: TabInfo) {
    // Navigate to graph view with subject as pivot entity
    const element = {
      uri: result.subject,
      label: this.extractLabelFromUri(result.subject)
    };
    this.viewEntityGraph(element, tab);
  }

  truncateUri(uri: string): string {
    if (!uri) return '';
    
    // For URIs longer than 50 characters, show first 47 characters + "..."
    if (uri.length > 50) {
      return uri.substring(0, 47) + '...';
    }
    
    return uri;
  }

  private extractLabelFromUri(uri: string): string {
    if (!uri) return 'Unknown';
    
    if (uri.includes('#')) {
      const parts = uri.split('#');
      return parts[parts.length - 1];
    } else if (uri.includes('/')) {
      const parts = uri.split('/');
      return parts[parts.length - 1];
    }
    
    return uri;
  }
  
  ngOnDestroy() {
    console.log('Component destroying, cleaning up subscriptions');
    
    // Clean up loading subscriptions
    this.searchLoadingSubscriptions.forEach(subscription => {
      if (subscription && !subscription.closed) {
        subscription.unsubscribe();
      }
    });
    this.searchLoadingSubscriptions.clear();
    
    // Clean up search data sources if needed
    this.searchDataSources.forEach(dataSource => {
      if (dataSource) {
        dataSource.disconnect();
      }
    });
    this.searchDataSources.clear();
    this.searchStates.clear();
  }
}