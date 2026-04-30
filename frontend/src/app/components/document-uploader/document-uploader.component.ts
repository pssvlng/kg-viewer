import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DocumentService } from '../../services/document.service';

@Component({
  selector: 'app-document-uploader',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule
  ],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>Upload TTL File</mat-card-title>
      </mat-card-header>
      
      <mat-card-content>
        <div class="form-section">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Graph Name (Optional)</mat-label>
            <input matInput 
                   [(ngModel)]="graphName" 
                   placeholder="Enter Graph Name Or Leave Empty For Default">
            <mat-icon matSuffix 
                      *ngIf="graphName" 
                      class="clear-icon"
                      (click)="clearGraphName()"
                      matTooltip="Clear Graph Name">close</mat-icon>
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
            <mat-spinner *ngIf="isProcessing" diameter="20"></mat-spinner>
            Upload TTL File
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
    
    .clear-icon {
      cursor: pointer;
      color: #666;
      font-size: 18px;
    }
    
    .clear-icon:hover {
      color: #333;
    }
    
    button[disabled] {
      opacity: 0.6;
    }
    
    button mat-spinner {
      margin-right: 8px;
    }
  `]
})
export class DocumentUploaderComponent implements OnDestroy {
  @Input() disabled: boolean = false;
  @Output() documentProcessed = new EventEmitter<any>();
  @Output() uploadStarted = new EventEmitter<{jobId: string, filename: string}>();
  @Output() newUploadStarted = new EventEmitter<void>();
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  
  selectedFile: File | null = null;
  graphName: string = '';
  isProcessing: boolean = false;
  private readonly allowedExtensions = ['ttl'];
  private readonly destroy$ = new Subject<void>();

  constructor(
    private snackBar: MatSnackBar,
    private documentService: DocumentService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  clearGraphName() {
    this.graphName = '';
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    const extension = this.getFileExtension(file?.name);

    if (file && extension && this.allowedExtensions.includes(extension)) {
      this.selectedFile = file;
      this.newUploadStarted.emit(); // Clear previous results
      this.snackBar.open('File Selected', 'Close', {
        duration: 2000
      });
      // Automatically start upload when file is selected
      this.uploadFile();
    } else {
      this.snackBar.open('Please select a valid TTL file', 'Close', {
        duration: 3000
      });
      // Reset the file input using our helper method
      this.resetFileInput();
    }
  }

  private getFileExtension(filename: string): string {
    if (!filename || !filename.includes('.')) {
      return '';
    }
    return filename.toLowerCase().split('.').pop() || '';
  }

  uploadFile() {
    if (!this.selectedFile || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.cd.markForCheck();

    this.documentService.uploadFile(this.selectedFile, this.graphName.trim())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.isProcessing = false;
          this.cd.markForCheck();
          
          // Check if this is the new job-based response
          if (result.jobId) {
            // New job-based flow
            this.uploadStarted.emit({
              jobId: result.jobId,
              filename: result.filename || this.selectedFile!.name
            });
            this.snackBar.open('Upload Started - Progress Will Be Shown', 'Close', {
              duration: 3000
            });
          } else {
            // Handle upload response and start monitoring
            this.documentProcessed.emit(result);
            this.snackBar.open('File Uploaded And Processed Successfully!', 'Close', {
              duration: 3000
            });
          }
          
          // Reset for next upload
          this.resetFileInput();
        },
        error: (error) => {
          this.isProcessing = false;
          this.cd.markForCheck();
          this.snackBar.open('Upload Error: ' + (error.error?.error || error.message), 'Close', {
            duration: 5000
          });
          // Reset for retry
          this.resetFileInput();
        }
      });
  }

  private resetFileInput() {
    this.selectedFile = null;
    if (this.fileInput && this.fileInput.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }
}