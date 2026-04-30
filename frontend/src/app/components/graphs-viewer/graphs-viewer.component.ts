import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { ContentNavigable, ContentNavigationEvent } from '../../services/content-navigation.interface';
import { Graph, GraphsService } from '../../services/graphs.service';
import { ResultsComponent } from '../results/results.component';
import { GraphAnalysisDialogComponent } from './graph-analysis-dialog.component';

@Component({
  selector: 'app-graphs-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatProgressSpinnerModule
  ],
  template: `
    <mat-card class="graphs-card">
      <mat-card-header>
        <div class="header-content">
          <div class="title-section">
            <div class="title-with-button">
              <mat-card-title>Named Graphs</mat-card-title>
              <button mat-raised-button 
                      color="primary"
                      (click)="refreshGraphs()"
                      [disabled]="loading"
                      matTooltip="Refresh Graphs"
                      class="refresh-btn">
                <mat-spinner *ngIf="loading" diameter="18" class="btn-spinner"></mat-spinner>
                <mat-icon *ngIf="!loading">refresh</mat-icon>
                Refresh
              </button>
            </div>
            <mat-card-subtitle>View And Manage Knowledge Graphs</mat-card-subtitle>
          </div>
        </div>
      </mat-card-header>
      
      <mat-card-content>
        <!-- Filter Section -->
        <div class="filter-section">
          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>Filter Graphs</mat-label>
            <input matInput 
                   [formControl]="filterControl"
                   placeholder="Search by name or URI">
            <mat-icon matSuffix 
                      *ngIf="filterControl.value" 
                      class="clear-icon"
                      (click)="clearFilter()"
                      matTooltip="Clear Filter">close</mat-icon>
          </mat-form-field>
        </div>
        
        <div class="table-container">
          <table mat-table [dataSource]="dataSource" class="graphs-table">
            
            <!-- Graph Name Column -->
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Graph Name</th>
              <td mat-cell *matCellDef="let graph">
                <strong>{{ graph.name }}</strong>
              </td>
            </ng-container>
            
            <!-- Graph URI Column -->
            <ng-container matColumnDef="uri">
              <th mat-header-cell *matHeaderCellDef>Graph URI</th>
              <td mat-cell *matCellDef="let graph">
                <code class="graph-uri">{{ graph.uri }}</code>
              </td>
            </ng-container>
            
            <!-- Actions Column -->
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef>Actions</th>
              <td mat-cell *matCellDef="let graph" class="actions-cell">
                <button mat-icon-button 
                        class="view-btn"
                        (click)="viewGraphAnalysis(graph)"
                        [disabled]="loadingAnalysisGraphUri === graph.uri"
                        matTooltip="View Graph Details">
                  <mat-spinner *ngIf="loadingAnalysisGraphUri === graph.uri" diameter="20"></mat-spinner>
                  <mat-icon *ngIf="loadingAnalysisGraphUri !== graph.uri">visibility</mat-icon>
                </button>
                <button mat-icon-button 
                        class="delete-btn"
                        (click)="deleteGraph(graph)"
                        matTooltip="Delete Graph"
                        color="warn">
                  <mat-icon>delete</mat-icon>
                </button>
              </td>
            </ng-container>
            
            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          </table>
          
          <mat-paginator #paginator
                         [pageSizeOptions]="[5, 10, 25, 50]"
                         [pageSize]="10"
                         showFirstLastButtons>
          </mat-paginator>
        </div>
        
        <div *ngIf="graphs.length === 0" class="no-graphs">
          <mat-icon>info</mat-icon>
          <p>No Graphs Available. Upload Some RDF Data To Get Started.</p>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .graphs-card {
      margin: 20px 0;
    }
    
    .header-content {
      width: 100%;
    }
    
    .title-section {
      flex-grow: 1;
    }
    
    .title-with-button {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 4px;
    }
    
    .refresh-btn {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .btn-spinner {
      display: inline-block;
    }
    
    .filter-section {
      margin: 20px 0;
    }
    
    .filter-field {
      width: 300px;
    }
    
    .clear-icon {
      cursor: pointer;
      color: #666;
      font-size: 18px;
    }
    
    .clear-icon:hover {
      color: #333;
    }
    
    .table-container {
      margin: 20px 0;
      overflow-x: auto;
    }
    
    .graphs-table {
      width: 100%;
    }
    
    .graph-uri {
      background-color: #f5f5f5;
      padding: 4px 8px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      word-break: break-all;
    }
    
    .actions-cell {
      text-align: center;
    }
    
    .view-btn {
      color: #1976d2;
      margin-right: 8px;
    }
    
    .delete-btn {
      color: #d32f2f;
    }
    
    .no-graphs {
      text-align: center;
      padding: 40px;
      color: #666;
    }
    
    .no-graphs mat-icon {
      font-size: 48px;
      height: 48px;
      width: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }
  `]
})
export class GraphsViewerComponent implements OnInit, AfterViewInit, OnDestroy, ContentNavigable {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  
  @Input() useContainerNavigation = false;
  @Output() contentNavigation = new EventEmitter<ContentNavigationEvent>();
  
  graphs: Graph[] = [];
  dataSource = new MatTableDataSource<Graph>([]);
  displayedColumns = ['name', 'uri', 'actions'];
  filterControl = new FormControl('');
  loading = false;
  loadingAnalysisGraphUri: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private graphsService: GraphsService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private cd: ChangeDetectorRef
  ) {
    // Initialize with empty array to prevent filter errors
    this.dataSource.data = [];
  }

  ngOnInit() {
    this.loadGraphs();
    this.setupFiltering();
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  trackByGraphUri(_index: number, graph: Graph): string {
    return graph.uri;
  }

  setupFiltering() {
    this.filterControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(filterValue => {
      this.applyFilter(filterValue || '');
    });
  }

  applyFilter(filterValue: string) {
    this.dataSource.filter = filterValue.trim().toLowerCase();
    
    this.dataSource.filterPredicate = (data: Graph, filter: string) => {
      const searchStr = (data.name + ' ' + data.uri).toLowerCase();
      return searchStr.includes(filter);
    };

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  clearFilter() {
    this.filterControl.setValue('');
  }

  loadGraphs() {
    this.loading = true;
    this.cd.markForCheck();
    this.graphsService.getGraphs().pipe(
      finalize(() => {
        this.loading = false;
        this.cd.markForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        if (response.success && Array.isArray(response.graphs)) {
          this.graphs = response.graphs;
          this.dataSource.data = this.graphs;
        } else {
          this.snackBar.open('Failed To Load Graphs', 'Close', { duration: 3000 });
        }
      },
      error: (error) => {
        console.error('Error loading graphs:', error);
        this.snackBar.open(`Error Loading Graphs: ${error.message || error}`, 'Close', { duration: 3000 });
      }
    });
  }

  refreshGraphs() {
    this.loadGraphs();
  }

  viewGraphAnalysis(graph: Graph) {
    if (this.useContainerNavigation) {
      this.loadGraphAnalysisData(graph);
    } else {
      const dialogRef = this.dialog.open(GraphAnalysisDialogComponent, {
        width: '90vw',
        maxWidth: '1200px',
        height: '80vh',
        data: { graph }
      });
    }
  }
  
  private loadGraphAnalysisData(graph: Graph) {
    this.loadingAnalysisGraphUri = graph.uri;
    this.cd.markForCheck();
    this.graphsService.getGraphAnalysis(graph.name, graph.uri).pipe(
      finalize(() => {
        this.loadingAnalysisGraphUri = null;
        this.cd.markForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        if (response.success) {
          this.contentNavigation.emit({
            action: 'push',
            component: ResultsComponent,
            data: { 
              results: response.tabs || [],
              graphInfo: graph,
              isInContainer: true,
              hideActions: false,
              showNewUploadButton: false
            },
            title: `View: ${graph.name} (${graph.uri})`
          });
        } else {
          this.snackBar.open('Failed to load graph analysis', 'Close', { duration: 3000 });
        }
      },
      error: (error) => {
        console.error('Error loading graph analysis:', error);
        this.snackBar.open('Error loading graph analysis', 'Close', { duration: 3000 });
      }
    });
  }

  deleteGraph(graph: Graph) {
    if (confirm(`Are you sure you want to delete the graph "${graph.name}"? This may take several minutes for large graphs.`)) {
      this.snackBar.open(`Deleting graph "${graph.name}"... This may take several minutes.`, 'Close', { 
        duration: 0
      });
      
      this.graphsService.deleteGraph(graph.name, graph.uri).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: (response) => {
          this.snackBar.dismiss();
          if (response.success) {
            this.snackBar.open(response.message || `Graph "${graph.name}" deleted successfully`, 'Close', { duration: 5000 });
            this.loadGraphs();
          } else {
            this.snackBar.open(`Failed to delete graph: ${response.message}`, 'Close', { duration: 5000 });
          }
        },
        error: (error) => {
          this.snackBar.dismiss();
          console.error('Error deleting graph:', error);
          this.snackBar.open(`Error deleting graph: ${error.error?.message || error.message}`, 'Close', { duration: 5000 });
        }
      });
    }
  }
}