import { Component, EventEmitter, Input, Output, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface UploadInfo {
  status: string;
  message: string;
  graphId: string;
  graphName: string;
  graphUri: string;
  triplesCount: number;
  sparqlEndpoint: string;
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
    MatCardModule,
    MatTabsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule
  ],
  template: `
    <mat-card class="results-card">
      <mat-card-header>
        <mat-card-title>Knowledge Graph Analysis</mat-card-title>
        <mat-card-subtitle>Analysis results for uploaded TTL data</mat-card-subtitle>
      </mat-card-header>
      
      <mat-card-content>
        <mat-tab-group class="results-tabs">
          <mat-tab 
            *ngFor="let tab of tabs; trackBy: trackByFn" 
            [label]="tab.label">
            
            <!-- Summary View -->
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
                  <span class="count">{{ tab.uploadInfo.analysisResults.foundClassesCount }}</span>
                </div>
                
                <div class="result-item" *ngIf="tab.uploadInfo?.analysisResults">
                  <strong>Class Definitions Loaded:</strong> 
                  <span class="count">{{ tab.uploadInfo.analysisResults.classDefinitionsLoaded }}</span>
                </div>
              </div>
              
              <div class="content-text">
                <pre>{{ tab.content }}</pre>
              </div>
            </div>
            
            <!-- Table View -->
            <div *ngIf="tab.type === 'table' && tab.data" class="table-content">
              <div class="table-header">
                <h3>{{ tab.content }}</h3>
                <div class="table-actions">
                  <mat-form-field appearance="outline">
                    <mat-label>Filter</mat-label>
                    <input matInput 
                           (keyup)="applyFilter($event, tab)" 
                           placeholder="Filter results">
                  </mat-form-field>
                </div>
              </div>
              
              <div class="table-container">
                <table mat-table 
                       [dataSource]="getDataSource(tab)" 
                       matSort 
                       class="results-table">
                  
                  <!-- Dynamic columns -->
                  <ng-container *ngFor="let column of getDisplayedColumns(tab)" 
                                [matColumnDef]="column">
                    <th mat-header-cell *matHeaderCellDef mat-sort-header>
                      {{ getColumnLabel(column) }}
                    </th>
                    <td mat-cell *matCellDef="let element">
                      <span *ngIf="column === 'uri'">
                        <a [href]="element[column]" target="_blank" 
                           class="uri-link">{{ element[column] }}</a>
                      </span>
                      <span *ngIf="column !== 'uri'">
                        {{ element[column] }}
                      </span>
                    </td>
                  </ng-container>
                  
                  <tr mat-header-row 
                      *matHeaderRowDef="getDisplayedColumns(tab)"></tr>
                  <tr mat-row 
                      *matRowDef="let row; columns: getDisplayedColumns(tab);"></tr>
                </table>
              </div>
              
              <mat-paginator 
                [pageSizeOptions]="[5, 10, 20, 50]" 
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
      
      <mat-card-actions>
        <button mat-raised-button color="primary" (click)="newUpload()">
          <mat-icon>add</mat-icon>
          New Upload
        </button>
        <button mat-button (click)="exportResults()">
          <mat-icon>download</mat-icon>
          Export Results
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
export class ResultsComponent implements OnInit {
  @Input() results: TabInfo[] = [];
  @Output() newUploadRequested = new EventEmitter<void>();
  
  tabs: TabInfo[] = [];
  dataSources = new Map<string, MatTableDataSource<any>>();
  displayedColumns = new Map<string, string[]>();
  columnFilters = new Map<string, any>();
  
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  ngOnInit() {
    this.tabs = this.results || [];
    this.initializeDataSources();
  }

  trackByFn(index: number, item: TabInfo): string {
    return item.label;
  }

  initializeDataSources() {
    this.tabs.forEach(tab => {
      if (tab.type === 'table' && tab.data) {
        const dataSource = new MatTableDataSource(tab.data);
        this.dataSources.set(tab.label, dataSource);
        
        // Set up columns
        if (tab.data.length > 0) {
          const columns = Object.keys(tab.data[0]);
          this.displayedColumns.set(tab.label, columns);
        }
        
        // Set up custom filter
        dataSource.filterPredicate = (data: any, filter: string) => {
          const filters = JSON.parse(filter || '{}');
          return Object.keys(filters).every(key => {
            const value = data[key];
            const filterValue = filters[key];
            if (!filterValue) return true;
            return value && value.toString().toLowerCase().includes(filterValue.toLowerCase());
          });
        };
      }
    });
  }

  getDataSource(tab: TabInfo): MatTableDataSource<any> {
    return this.dataSources.get(tab.label) || new MatTableDataSource([]);
  }

  getDisplayedColumns(tab: TabInfo): string[] {
    return this.displayedColumns.get(tab.label) || [];
  }

  getColumnLabel(column: string): string {
    // Convert camelCase to readable format
    return column.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  }

  applyFilter(event: Event, tab: TabInfo) {
    const filterValue = (event.target as HTMLInputElement).value;
    const dataSource = this.dataSources.get(tab.label);
    if (dataSource) {
      // Simple global filter
      dataSource.filter = filterValue.trim().toLowerCase();
    }
  }

  applyColumnFilter(filterValue: string, column: string, tab: TabInfo) {
    const filters = this.columnFilters.get(tab.label) || {};
    
    if (column === 'label') {
      filters.label = filterValue;
    } else if (column === 'uri') {
      filters.uri = filterValue;
    }
    
    this.columnFilters.set(tab.label, filters);
    
    const dataSource = this.dataSources.get(tab.label);
    if (dataSource) {
      dataSource.filter = JSON.stringify(filters);
    }
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

  exportResults() {
    // Create a downloadable JSON file with all results
    const exportData = {
      timestamp: new Date().toISOString(),
      tabs: this.tabs
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `kg-analysis-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}