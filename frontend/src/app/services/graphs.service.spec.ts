import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { GraphsService } from './graphs.service';

describe('GraphsService', () => {
  let service: GraphsService;
  let httpMock: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [GraphsService],
    });
    service = TestBed.inject(GraphsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getGraphs', () => {
    it('should GET /api/graphs', () => {
      service.getGraphs().subscribe();
      const req = httpMock.expectOne(`${api}/api/graphs`);
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, graphs: [], count: 0 });
    });

    it('should return graphs array', (done) => {
      const graphs = [{ name: 'g1', uri: 'http://ex.org/g1' }];
      service.getGraphs().subscribe(res => {
        expect(res.graphs).toEqual(graphs);
        done();
      });
      httpMock.expectOne(`${api}/api/graphs`).flush({ success: true, graphs, count: 1 });
    });
  });

  describe('getGraphAnalysis', () => {
    it('should GET graph analysis', () => {
      service.getGraphAnalysis('my-graph').subscribe();
      const req = httpMock.expectOne(r => r.url === `${api}/api/graphs/${encodeURIComponent('my-graph')}/analysis`);
      expect(req.request.method).toBe('GET');
      req.flush({ success: true, graphName: 'my-graph', graphUri: '', tabs: [] });
    });

    it('should include graphUri query param when provided', () => {
      service.getGraphAnalysis('my-graph', 'http://ex.org/g').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/analysis'));
      expect(req.request.params.get('graphUri')).toBe('http://ex.org/g');
      req.flush({ success: true, graphName: 'my-graph', graphUri: 'http://ex.org/g', tabs: [] });
    });
  });

  describe('deleteGraph', () => {
    it('should DELETE graph by name', () => {
      service.deleteGraph('my-graph').subscribe();
      const req = httpMock.expectOne(r => r.url.includes(`/api/graphs/${encodeURIComponent('my-graph')}`));
      expect(req.request.method).toBe('DELETE');
      req.flush({ success: true, message: 'Deleted' });
    });
  });
});
