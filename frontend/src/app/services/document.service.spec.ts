import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { DocumentService } from './document.service';

describe('DocumentService', () => {
  let service: DocumentService;
  let httpMock: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [DocumentService],
    });
    service = TestBed.inject(DocumentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('uploadFile', () => {
    it('should POST to /api/upload with FormData', () => {
      const file = new File(['@prefix ex: <http://ex.org/> .'], 'test.ttl', { type: 'text/turtle' });
      service.uploadFile(file, 'my-graph').subscribe();

      const req = httpMock.expectOne(`${api}/api/upload`);
      expect(req.request.method).toBe('POST');
      req.flush({ success: true, jobId: 'abc-123' });
    });

    it('should return jobId from response', (done) => {
      const file = new File([''], 'test.ttl');
      service.uploadFile(file, 'g').subscribe(res => {
        expect(res.jobId).toBe('abc-123');
        done();
      });
      httpMock.expectOne(`${api}/api/upload`).flush({ success: true, jobId: 'abc-123' });
    });
  });

  describe('getUploadStatus', () => {
    it('should GET job status by ID', () => {
      service.getUploadStatus('job-1').subscribe();
      const req = httpMock.expectOne(`${api}/api/upload/status/job-1`);
      expect(req.request.method).toBe('GET');
      req.flush({ job_id: 'job-1', status: 'processing' });
    });
  });

  describe('getAnalysisProgress', () => {
    it('should return not_implemented status', (done) => {
      service.getAnalysisProgress('job-1').subscribe(res => {
        expect(res.status).toBe('not_implemented');
        done();
      });
    });
  });
});
