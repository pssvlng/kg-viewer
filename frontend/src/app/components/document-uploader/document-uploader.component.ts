import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DocumentService } from '../../services/document.service';

@Component({
  selector: 'app-document-uploader',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>TTL File Upload</mat-card-title>
      </mat-card-header>
      
      <mat-card-content>
        <div class="form-section">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Graph Name (optional)</mat-label>
            <input matInput 
                   [(ngModel)]="graphName" 
                   placeholder="Enter graph name or leave empty for default">
          </mat-form-field>
        </div>
        
        <div class="upload-section">
          <input 
            type="file" 
            #fileInput 
            (change)="onFileSelected($event)"
            accept=".ttl"
            style="display: none">
          
          <button 
            mat-raised-button 
            color="primary"
            [disabled]="isProcessing || disabled"
            (click)="fileInput.click()">
            <mat-icon *ngIf="!isProcessing">upload_file</mat-icon>
            <mat-spinner *ngIf="isProcessing" diameter="20"></mat-spinner>
            {{ getUploadButtonText() }}
          </button>
          
          <span *ngIf="selectedFile && !isProcessing" class="file-name">
            {{ selectedFile.name }}
          </span>
          
          <div *ngIf="isProcessing" class="processing-info">
            <mat-spinner diameter="24"></mat-spinner>
            <span>Processing file...</span>
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .form-section {
      margin-bottom: 20px;
    }
    
    .upload-section {
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 15px;
    }
    
    .file-name {
      color: #666;
      font-style: italic;
    }
    
    .processing-info {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #1976d2;
      font-weight: 500;
    }
    
    .full-width {
      width: 100%;
    }
    
    button[disabled] {
      opacity: 0.6;
    }
    
    button mat-spinner {
      margin-right: 8px;
    }
  `]
})
export class DocumentUploaderComponent {
  @Input() disabled: boolean = false;
  @Output() documentProcessed = new EventEmitter<any>();
  @Output() uploadStarted = new EventEmitter<{jobId: string, filename: string}>();
  
  selectedFile: File | null = null;
  graphName: string = '';
  isProcessing: boolean = false;

  constructor(
    private snackBar: MatSnackBar,
    private documentService: DocumentService
  ) {}

  getUploadButtonText(): string {
    if (this.isProcessing) {
      return 'Processing...';
    }
    if (this.disabled) {
      return 'Upload in progress...';
    }
    return 'Upload TTL File';
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file && file.name.toLowerCase().endsWith('.ttl')) {
      this.selectedFile = file;
      this.snackBar.open('TTL file selected', 'Close', {
        duration: 2000
      });
      // Automatically start upload when file is selected
      this.uploadFile();
    } else {
      this.snackBar.open('Please select a valid TTL file', 'Close', {
        duration: 3000
      });
      // Reset the file input
      event.target.value = '';
    }
  }

  uploadFile() {
    if (!this.selectedFile || this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    this.documentService.uploadFile(this.selectedFile, this.graphName.trim())
      .subscribe({
        next: (result) => {
          this.isProcessing = false;
          
          // Check if this is the new job-based response
          if (result.jobId) {
            // New job-based flow
            this.uploadStarted.emit({
              jobId: result.jobId,
              filename: result.filename || this.selectedFile!.name
            });
            this.snackBar.open('Upload started - progress will be shown', 'Close', {
              duration: 3000
            });
          } else {
            // Handle upload response and start monitoring
            this.documentProcessed.emit(result);
            this.snackBar.open('File uploaded and processed successfully!', 'Close', {
              duration: 3000
            });
          }
          
          // Reset for next upload
          this.selectedFile = null;
        },
        error: (error) => {
          this.isProcessing = false;
          this.snackBar.open('Upload error: ' + (error.error?.error || error.message), 'Close', {
            duration: 5000
          });
          // Reset for retry
          this.selectedFile = null;
        }
      });
  }
}