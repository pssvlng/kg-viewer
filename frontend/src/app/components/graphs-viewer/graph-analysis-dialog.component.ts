import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { ResultsComponent } from '../results/results.component';
import { GraphsService, Graph, GraphAnalysisResponse } from '../../services/graphs.service';

@Component({
  selector: 'app-graph-analysis-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    ResultsComponent
  ],
  template: `
    <div class="dialog-header">
      <h2 mat-dialog-title>
        <mat-icon>analytics</mat-icon>
        Graph Analysis - {{ data.graph.name }}
      </h2>
      <button mat-icon-button mat-dialog-close>
        <mat-icon>close</mat-icon>
      </button>
    </div>
    
    <mat-dialog-content>
      <!-- Loading State -->
      <div *ngIf="loading" class="loading-container">
        <mat-spinner diameter="50"></mat-spinner>
        <p>Loading graph analysis...</p>
      </div>
      
      <!-- Error State -->
      <div *ngIf="error" class="error-container">
        <mat-icon color="warn">error</mat-icon>
        <p>{{ error }}</p>
        <button mat-button color="primary" (click)="loadAnalysis()">
          <mat-icon>refresh</mat-icon>
          Retry
        </button>
      </div>
      
      <!-- Results - Reusing the existing ResultsComponent -->
      <app-results 
        *ngIf="analysisResults && !loading"
        [results]="analysisResults"
        [hideActions]="true">
      </app-results>
    </mat-dialog-content>
  `,
  styles: [`
    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 24px;
      border-bottom: 1px solid #e0e0e0;
    }
    
    .dialog-header h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }
    
    mat-dialog-content {
      padding: 0;
      margin: 0;
      max-height: 70vh;
      overflow: auto;
    }
    
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      text-align: center;
    }
    
    .loading-container p {
      margin-top: 16px;
      color: #666;
    }
    
    .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      text-align: center;
      color: #d32f2f;
    }
    
    .error-container mat-icon {
      font-size: 48px;
      height: 48px;
      width: 48px;
      margin-bottom: 16px;
    }
    
    .error-container p {
      margin-bottom: 16px;
    }
  `]
})
export class GraphAnalysisDialogComponent implements OnInit {
  loading = false;
  error: string | null = null;
  analysisResults: any[] = [];

  constructor(
    private dialogRef: MatDialogRef<GraphAnalysisDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { graph: Graph },
    private graphsService: GraphsService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loadAnalysis();
  }

  loadAnalysis() {
    this.loading = true;
    this.error = null;
    
    this.graphsService.getGraphAnalysis(this.data.graph.name).subscribe(
      (response: GraphAnalysisResponse) => {
        this.loading = false;
        if (response.success) {
          this.analysisResults = response.tabs || [];
        } else {
          this.error = response.error || 'Failed to load graph analysis';
        }
      },
      (error: any) => {
        this.loading = false;
        this.error = 'Error loading graph analysis: ' + (error.message || 'Unknown error');
        console.error('Error loading graph analysis:', error);
      }
    );
  }
}