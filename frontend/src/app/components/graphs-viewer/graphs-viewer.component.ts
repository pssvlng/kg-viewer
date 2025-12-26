import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GraphsService, Graph } from '../../services/graphs.service';
import { GraphAnalysisDialogComponent } from './graph-analysis-dialog.component';

@Component({
  selector: 'app-graphs-viewer',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule
  ],
  template: `
    <mat-card class="graphs-card">
      <mat-card-header>
        <mat-card-title>Named Graphs</mat-card-title>
        <mat-card-subtitle>View and manage knowledge graphs</mat-card-subtitle>
      </mat-card-header>
      
      <mat-card-content>
        <div class="table-container">
          <table mat-table [dataSource]="graphs" class="graphs-table">
            
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
                        matTooltip="View graph analysis">
                  <mat-icon>visibility</mat-icon>
                </button>
                <button mat-icon-button 
                        class="delete-btn"
                        (click)="deleteGraph(graph)"
                        matTooltip="Delete graph"
                        color="warn">
                  <mat-icon>delete</mat-icon>
                </button>
              </td>
            </ng-container>
            
            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          </table>
        </div>
        
        <div *ngIf="graphs.length === 0" class="no-graphs">
          <mat-icon>info</mat-icon>
          <p>No graphs available. Upload some RDF data to get started.</p>
        </div>
      </mat-card-content>
      
      <mat-card-actions>
        <button mat-raised-button color="primary" (click)="refreshGraphs()">
          <mat-icon>refresh</mat-icon>
          Refresh
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    .graphs-card {
      margin: 20px 0;
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
export class GraphsViewerComponent implements OnInit {
  graphs: Graph[] = [];
  displayedColumns = ['name', 'uri', 'actions'];

  constructor(
    private graphsService: GraphsService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loadGraphs();
  }

  loadGraphs() {
    this.graphsService.getGraphs().subscribe({
      next: (response) => {
        if (response.success) {
          this.graphs = response.graphs;
        } else {
          this.snackBar.open('Failed to load graphs', 'Close', { duration: 3000 });
        }
      },
      error: (error) => {
        console.error('Error loading graphs:', error);
        this.snackBar.open('Error loading graphs', 'Close', { duration: 3000 });
      }
    });
  }

  refreshGraphs() {
    this.loadGraphs();
    this.snackBar.open('Graphs refreshed', 'Close', { duration: 2000 });
  }

  viewGraphAnalysis(graph: Graph) {
    const dialogRef = this.dialog.open(GraphAnalysisDialogComponent, {
      width: '90vw',
      maxWidth: '1200px',
      height: '80vh',
      data: { graph }
    });
  }

  deleteGraph(graph: Graph) {
    if (confirm(`Are you sure you want to delete the graph "${graph.name}"?`)) {
      this.graphsService.deleteGraph(graph.name).subscribe({
        next: (response) => {
          if (response.success) {
            this.snackBar.open(`Graph "${graph.name}" deleted successfully`, 'Close', { duration: 3000 });
            this.loadGraphs(); // Refresh the list
          } else {
            this.snackBar.open('Failed to delete graph', 'Close', { duration: 3000 });
          }
        },
        error: (error) => {
          console.error('Error deleting graph:', error);
          this.snackBar.open('Error deleting graph', 'Close', { duration: 3000 });
        }
      });
    }
  }
}