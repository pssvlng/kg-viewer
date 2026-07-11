import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { DocumentService, UploadJob } from '../../services/document.service';
import { UploadProgressComponent } from './upload-progress.component';

const mockJob = (status: UploadJob['status'] = 'processing'): UploadJob => ({
  job_id: 'job-1', filename: 'test.ttl', graph_name: 'g', timestamp: '',
  status, progress: 50, total_triples: 100, processed_triples: 50,
  current_batch: 1, total_batches: 2
});

describe('UploadProgressComponent', () => {
  let component: UploadProgressComponent;
  let fixture: ComponentFixture<UploadProgressComponent>;
  let documentServiceSpy: jasmine.SpyObj<DocumentService>;

  beforeEach(async () => {
    documentServiceSpy = jasmine.createSpyObj('DocumentService', ['getUploadStatus', 'getAnalysisProgress']);
    documentServiceSpy.getUploadStatus.and.returnValue(of(mockJob()));
    documentServiceSpy.getAnalysisProgress.and.returnValue(of({ progress: 0, status: 'not_implemented' }));

    await TestBed.configureTestingModule({
      imports: [UploadProgressComponent, NoopAnimationsModule],
      providers: [{ provide: DocumentService, useValue: documentServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(UploadProgressComponent);
    component = fixture.componentInstance;
    component.jobId = 'job-1';
  });

  afterEach(() => {
    component.stopPolling();
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should start polling on init when jobId provided', (done) => {
    fixture.detectChanges();
    setTimeout(() => {
      expect(documentServiceSpy.getUploadStatus).toHaveBeenCalledWith('job-1');
      component.stopPolling();
      done();
    }, 2100);
  });

  it('should not start polling without jobId', (done) => {
    component.jobId = '';
    fixture.detectChanges();
    setTimeout(() => {
      expect(documentServiceSpy.getUploadStatus).not.toHaveBeenCalled();
      done();
    }, 2100);
  });

  it('should set job from polling response', (done) => {
    fixture.detectChanges();
    setTimeout(() => {
      expect(component.job).toBeTruthy();
      expect(component.job?.job_id).toBe('job-1');
      component.stopPolling();
      done();
    }, 2100);
  });

  it('should stop polling when job fails', (done) => {
    documentServiceSpy.getUploadStatus.and.returnValue(of(mockJob('failed')));
    fixture.detectChanges();
    setTimeout(() => {
      expect(component.job?.status).toBe('failed');
      done();
    }, 2100);
  });
});
