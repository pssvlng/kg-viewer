import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { DocumentService, UploadJob } from '../../services/document.service';

@Component({
  selector: 'app-upload-progress',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatButtonModule
  ],
  template: `
    <mat-card class="progress-card">
      <mat-card-header>
        <mat-card-title>
          <mat-icon>cloud_upload</mat-icon>
          Upload Progress
        </mat-card-title>
        <mat-card-subtitle>{{ job?.filename }}</mat-card-subtitle>
      </mat-card-header>
      
      <mat-card-content>
        <div class="upload-info" *ngIf="job">
          <div class="info-row">
            <strong>Graph Name:</strong>
            <span>{{ job?.graph_name || 'default' }}</span>
          </div>
          
          <div class="info-row">
            <strong>Total Triples:</strong>
            <span>{{ job?.total_triples | number }}</span>
          </div>
          
          <div class="info-row">
            <strong>Status:</strong>
            <span [ngClass]="getStatusClass()">{{ getStatusText() }}</span>
          </div>
        </div>
        
        <!-- Phase 1: Upload Progress -->
        <div class="progress-section" *ngIf="job">
          <h4>Data Upload</h4>
          <mat-progress-bar 
            mode="determinate" 
            [value]="job.progress">
          </mat-progress-bar>
          
          <div class="progress-text">
            {{ job.processed_triples | number }} / {{ job.total_triples | number }} triples
            ({{ job.progress.toFixed(1) }}%)
          </div>
          
          <div class="batch-info" *ngIf="job?.status === 'processing'">
            Batch {{ job.current_batch }} of {{ job.total_batches }}
          </div>
        </div>
        
        <!-- Phase 2: Analysis Progress -->
        <div class="analysis-section" *ngIf="job?.status === 'processing' || job?.status === 'success'">
          <h4>Data Analysis</h4>
          <div *ngIf="analysisProgress?.progress !== undefined; else analysisWaiting">
            <mat-progress-bar 
              mode="determinate" 
              [value]="analysisProgress.progress">
            </mat-progress-bar>
            <span class="progress-text">{{ getAnalysisStatusText() }}</span>
          </div>
          <ng-template #analysisWaiting>
            <mat-progress-bar mode="indeterminate"></mat-progress-bar>
            <span class="progress-text">Preparing analysis...</span>
          </ng-template>
        </div>
        
        <div class="analysis-details" *ngIf="job?.analysisProgress">
          <div class="analysis-status" *ngIf="job.analysisProgress">
            {{ job.analysisProgress.status }}
          </div>
        </div>
        
        <div class="error-message" *ngIf="job?.status === 'failed'">
          <mat-icon>error</mat-icon>
          <span>{{ job.error_message }}</span>
        </div>
        
        <div class="success-message" *ngIf="job?.status === 'success'">
          <mat-icon>check_circle</mat-icon>
          <span>Upload and analysis completed successfully!</span>
        </div>
      </mat-card-content>
      
      <mat-card-actions *ngIf="job?.status === 'failed'">
        <button mat-button (click)="goBack()">
          <mat-icon>arrow_back</mat-icon>
          Try Again
        </button>
      </mat-card-actions>
      
      <mat-card-actions *ngIf="job?.status === 'success'">
        <button mat-raised-button color="primary" (click)="viewResults()">
          <mat-icon>visibility</mat-icon>
          View Results
        </button>
        <button mat-button (click)="goBack()">
          <mat-icon>arrow_back</mat-icon>
          New Upload
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    .progress-card {
      margin: 20px 0;
    }
    
    .upload-info {
      margin-bottom: 20px;
      padding: 16px;
      background-color: #f5f5f5;
      border-radius: 4px;
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    
    .info-row:last-child {
      margin-bottom: 0;
    }
    
    .progress-section, .analysis-section {
      margin-bottom: 20px;
    }
    
    .progress-section h4, .analysis-section h4 {
      margin-bottom: 10px;
      color: #1976d2;
    }
    
    .progress-text {
      margin-top: 8px;
      font-size: 14px;
      color: #666;
    }
    
    .batch-info {
      margin-top: 4px;
      font-size: 12px;
      color: #999;
    }
    
    .analysis-details {
      margin-top: 10px;
    }
    
    .analysis-status {
      font-size: 14px;
      color: #1976d2;
      font-style: italic;
    }
    
    .error-message, .success-message {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 16px;
      padding: 12px;
      border-radius: 4px;
    }
    
    .error-message {
      background-color: #ffebee;
      color: #c62828;
    }
    
    .success-message {
      background-color: #e8f5e8;
      color: #2e7d32;
    }
    
    .status-processing {
      color: #1976d2;
    }
    
    .status-success {
      color: #4caf50;
      font-weight: 500;
    }
    
    .status-failed {
      color: #f44336;
      font-weight: 500;
    }
  `]
})
export class UploadProgressComponent implements OnInit, OnDestroy {
  @Input() jobId: string = '';
  @Output() navigationRequested = new EventEmitter<{action: string, data?: any}>();
  
  job: UploadJob | null = null;
  analysisProgress: any = {};
  private statusInterval: any;
  private analysisInterval: any;

  constructor(private documentService: DocumentService) {}

  ngOnInit() {
    if (this.jobId) {
      this.startPolling();
    }
  }

  ngOnDestroy() {
    this.stopPolling();
  }

  startPolling() {
    // Poll job status every 2 seconds
    this.statusInterval = setInterval(() => {
      this.documentService.getUploadStatus(this.jobId).subscribe({
        next: (job) => {
          this.job = job;
          
          if (job.status === 'success' && job.result_data) {
            // Job completed with results
            this.stopPolling();
            setTimeout(() => {
              this.viewResults();
            }, 2000); // Show success for 2 seconds then auto-navigate
          } else if (job.status === 'failed') {
            this.stopPolling();
          }
        },
        error: (error) => {
          console.error('Error fetching job status:', error);
        }
      });
    }, 2000);
    
    // Poll analysis progress every 3 seconds
    this.analysisInterval = setInterval(() => {
      if (this.job && this.job.status === 'processing') {
        this.documentService.getAnalysisProgress(this.jobId).subscribe({
          next: (progress) => {
            this.analysisProgress = progress;
          },
          error: (error) => {
            // Analysis progress might not be available yet
          }
        });
      }
    }, 3000);
  }

  stopPolling() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
    }
  }

  getStatusText(): string {
    if (!this.job) return 'Unknown';
    
    switch (this.job.status) {
      case 'processing':
        return 'Processing';
      case 'success':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return this.job.status;
    }
  }

  getStatusClass(): string {
    if (!this.job) return '';
    return `status-${this.job.status}`;
  }

  getAnalysisStatusText(): string {
    if (this.analysisProgress?.progress !== undefined) {
      return `${this.analysisProgress.progress.toFixed(1)}% - ${this.analysisProgress.status}`;
    }
    return 'Analyzing data...';
  }

  goBack() {
    this.stopPolling();
    this.navigationRequested.emit({ action: 'goBack' });
  }

  viewResults() {
    this.stopPolling();
    if (this.job?.result_data) {
      this.navigationRequested.emit({ 
        action: 'showResults', 
        data: this.job.result_data 
      });
    }
  }
}