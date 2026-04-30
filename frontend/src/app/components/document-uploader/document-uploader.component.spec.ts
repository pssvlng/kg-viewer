import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { DocumentService } from '../../services/document.service';
import { DocumentUploaderComponent } from './document-uploader.component';

describe('DocumentUploaderComponent', () => {
  let component: DocumentUploaderComponent;
  let fixture: ComponentFixture<DocumentUploaderComponent>;
  let documentServiceSpy: jasmine.SpyObj<DocumentService>;

  beforeEach(async () => {
    documentServiceSpy = jasmine.createSpyObj('DocumentService', ['uploadFile', 'getUploadStatus']);

    await TestBed.configureTestingModule({
      imports: [DocumentUploaderComponent, NoopAnimationsModule],
      providers: [
        { provide: DocumentService, useValue: documentServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DocumentUploaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should reject non-TTL files and not set selectedFile', () => {
    const fakeEvent = { target: { files: [new File([''], 'test.csv', { type: 'text/csv' })] } };
    component.onFileSelected(fakeEvent);
    expect(component.selectedFile).toBeNull();
    expect(component.isProcessing).toBe(false);
  });

  it('should emit uploadStarted when TTL file selected and upload succeeds', (done) => {
    documentServiceSpy.uploadFile.and.returnValue(of({ success: true, jobId: 'job-1', message: 'ok' }));
    component.uploadStarted.subscribe(event => {
      expect(event.jobId).toBe('job-1');
      done();
    });
    const fakeEvent = { target: { files: [new File(['@prefix ex: <http://ex.org/> .'], 'test.ttl')] } };
    component.onFileSelected(fakeEvent);
  });

  it('should not upload when no file selected', () => {
    component.selectedFile = null;
    component.uploadFile();
    expect(documentServiceSpy.uploadFile).not.toHaveBeenCalled();
  });
});
