import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DocumentUploaderComponent } from '../document-uploader/document-uploader.component';
import { UploadProgressComponent } from '../upload-progress/upload-progress.component';
import { ResultsComponent, TabInfo } from '../results/results.component';
import { GraphViewerComponent } from '../graph-viewer/graph-viewer.component';
import { ContentNavigable, ContentNavigationEvent } from '../../services/content-navigation.interface';

@Component({
  selector: 'app-upload-manager',
  standalone: true,
  imports: [
    CommonModule,
    DocumentUploaderComponent,
    UploadProgressComponent,
    ResultsComponent,
    GraphViewerComponent
  ],
  template: `
    <div class="upload-manager">
      <app-document-uploader 
        [disabled]="isUploading"
        (uploadStarted)="onUploadStarted($event)"
        (newUploadStarted)="onNewUploadStarted()">
      </app-document-uploader>
      
      <app-upload-progress
        *ngIf="currentJobId && !results"
        [jobId]="currentJobId"
        (navigationRequested)="onNavigationRequested($event)">
      </app-upload-progress>
      
      <app-results 
        *ngIf="results" 
        [results]="results"
        [isInContainer]="true"
        (newUploadRequested)="onNewUploadRequested()"
        (contentNavigation)="onNavigationRequested($event)">
      </app-results>
    </div>
  `,
  styles: [`
    .upload-manager {
      padding: 0;
    }
  `]
})
export class UploadManagerComponent implements OnInit {
  @Output() contentNavigation = new EventEmitter<ContentNavigationEvent>();

  results: TabInfo[] | null = null;
  currentJobId: string | null = null;
  isUploading = false;

  constructor() {}

  ngOnInit() {
    console.log('UploadManager: Component initialized - this should appear immediately');
    console.log('UploadManager: Initial state - results:', this.results);
  }

  onNavigationRequested(event: any) {
    console.log('UploadManager: Navigation requested:', event);
    
    if (event.action === 'showResults' && event.data) {
      // Handle showing results locally
      console.log('UploadManager: Setting results from completed upload:', event.data);
      this.results = event.data;
      this.currentJobId = null;
      this.isUploading = false;
    } else if (event.action === 'goBack') {
      // Handle going back - reset to initial upload state
      console.log('UploadManager: Going back to upload');
      this.results = null;
      this.currentJobId = null;
      this.isUploading = false;
    } else {
      // For other events, emit to content container
      this.contentNavigation.emit(event);
    }
  }

  onUploadStarted(jobInfo: { jobId: string, filename: string }) {
    this.currentJobId = jobInfo.jobId;
    this.isUploading = true;
    this.results = null;
  }

  onNewUploadStarted() {
    this.results = null;
    this.currentJobId = null;
    this.isUploading = false;
  }

  onNewUploadRequested() {
    this.results = null;
    this.currentJobId = null;
    this.isUploading = false;
  }
}