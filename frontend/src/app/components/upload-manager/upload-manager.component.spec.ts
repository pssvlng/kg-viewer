import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { DocumentService } from '../../services/document.service';
import { UploadManagerComponent } from './upload-manager.component';

describe('UploadManagerComponent', () => {
  let component: UploadManagerComponent;
  let fixture: ComponentFixture<UploadManagerComponent>;

  beforeEach(async () => {
    const docServiceSpy = jasmine.createSpyObj('DocumentService', ['uploadFile', 'getUploadStatus', 'getAnalysisProgress']);
    docServiceSpy.uploadFile.and.returnValue(of({ success: true, jobId: 'j1', message: 'ok' }));
    docServiceSpy.getUploadStatus.and.returnValue(of({ job_id: 'j1', status: 'processing', progress: 0 }));
    docServiceSpy.getAnalysisProgress.and.returnValue(of({ progress: 0, status: 'not_implemented' }));

    await TestBed.configureTestingModule({
      imports: [UploadManagerComponent, NoopAnimationsModule],
      providers: [
        { provide: DocumentService, useValue: docServiceSpy },
        { provide: MatSnackBar, useValue: jasmine.createSpyObj('MatSnackBar', ['open']) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UploadManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should set currentJobId on upload started', () => {
    component.onUploadStarted({ jobId: 'job-1', filename: 'test.ttl' });
    expect(component.currentJobId).toBe('job-1');
    expect(component.isUploading).toBe(true);
    expect(component.results).toBeNull();
  });

  it('should clear results on new upload started', () => {
    component.results = { tabs: [] } as any;
    component.onNewUploadStarted();
    expect(component.results).toBeNull();
    expect(component.currentJobId).toBeNull();
  });

  it('should set results on navigation requested with data', () => {
    const data = [{ title: 'Summary', type: 'table', data: [] }];
    component.onNavigationRequested({ action: 'showResults', data });
    expect(component.results).toEqual(data as any);
    expect(component.isUploading).toBe(false);
  });
});
