import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { GraphVisualizationService } from './graph-visualization.service';

describe('GraphVisualizationService', () => {
  let service: GraphVisualizationService;
  let httpMock: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [GraphVisualizationService],
    });

    service = TestBed.inject(GraphVisualizationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should send maxNodes as numeric value when provided', () => {
    service.getEntityGraph('graph-1', 'http://ex.org/e1', 1, 'both', undefined, 100).subscribe();

    const req = httpMock.expectOne((request) => {
      return request.url === `${api}/api/graphs/graph-1/entities/http%3A%2F%2Fex.org%2Fe1/graph`;
    });

    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('maxNodes')).toBe('100');
    expect(req.request.params.get('direction')).toBe('both');
    req.flush({ nodes: [], edges: [], centralNode: 'http://ex.org/e1' });
  });

  it('should send maxNodes=all when maxNodes is null', () => {
    service.getEntityGraph('graph-1', 'http://ex.org/e1', 1, 'both', undefined, null).subscribe();

    const req = httpMock.expectOne((request) => {
      return request.url === `${api}/api/graphs/graph-1/entities/http%3A%2F%2Fex.org%2Fe1/graph`;
    });

    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('maxNodes')).toBe('all');
    req.flush({ nodes: [], edges: [], centralNode: 'http://ex.org/e1' });
  });
});
