import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTabsModule } from '@angular/material/tabs';
import { DocumentUploaderComponent } from './components/document-uploader/document-uploader.component';
import { UploadProgressComponent } from './components/upload-progress/upload-progress.component';
import { ResultsComponent, TabInfo } from './components/results/results.component';
import { GraphsViewerComponent } from './components/graphs-viewer/graphs-viewer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatTabsModule,
    DocumentUploaderComponent,
    UploadProgressComponent,
    ResultsComponent,
    GraphsViewerComponent
  ],
  template: `
    <mat-toolbar color="primary">
      <span class="toolbar-spacer"></span>
      <span>Knowledge Graph Viewer</span>
      <span class="toolbar-spacer"></span>
    </mat-toolbar>
    
    <div class="container">
      <mat-tab-group class="main-tabs" [(selectedIndex)]="selectedTabIndex">
        
        <!-- Upload Tab -->
        <mat-tab label="Upload">
          <div class="tab-content">
            <app-document-uploader 
              [disabled]="isUploading"
              (uploadStarted)="onUploadStarted($event)"
              (newUploadStarted)="onNewUploadStarted()"
              (documentProcessed)="onDocumentProcessed($event)">
            </app-document-uploader>
            
            <app-upload-progress
              *ngIf="currentJobId && !results"
              [jobId]="currentJobId"
              (navigationRequested)="onNavigationRequested($event)">
            </app-upload-progress>
            
            <app-results 
              *ngIf="results" 
              [results]="results"
              (newUploadRequested)="onNewUploadRequested()">
            </app-results>
          </div>
        </mat-tab>
        
        <!-- Graphs Tab -->
        <mat-tab label="Named Graphs">
          <div class="tab-content">
            <app-graphs-viewer></app-graphs-viewer>
          </div>
        </mat-tab>
        
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .container {
      max-width: 1200px;
      margin: 20px auto;
      padding: 0 20px;
    }
    
    .toolbar-spacer {
      flex: 1 1 auto;
    }
    
    .main-tabs {
      margin-top: 20px;
    }
    
    .tab-content {
      padding: 20px 0;
    }
  `]
})
export class AppComponent {
  results: any = null;
  currentJobId: string | null = null;
  selectedTabIndex = 0;
  isUploading = false;

  onUploadStarted(jobInfo: { jobId: string, filename: string }) {
    this.currentJobId = jobInfo.jobId;
    this.isUploading = true;
    this.results = null;
  }

  onDocumentProcessed(results: TabInfo[]) {
    this.results = results;
    this.currentJobId = null;
    this.isUploading = false;
  }

  onNewUploadStarted() {
    this.results = null;
    this.currentJobId = null;
    this.isUploading = true;
  }

  onNavigationRequested(event: { action: string, data?: any }) {
    if (event.action === 'goBack') {
      this.currentJobId = null;
      this.results = null;
      this.isUploading = false;
    } else if (event.action === 'showResults') {
      this.results = event.data;
      this.currentJobId = null;
      this.isUploading = false;
    }
  }

  onNewUploadRequested() {
    this.results = null;
    this.currentJobId = null;
    this.isUploading = false;
  }
}