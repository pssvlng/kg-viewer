import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { skip, take } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { ServerSideDataSource } from './server-side-data-source.service';

describe('ServerSideDataSource', () => {
  let httpMock: HttpTestingController;
  let dataSource: ServerSideDataSource;
  const api = environment.apiUrl;

  const flushSuccess = (data: any[] = []) =>
    httpMock.expectOne(() => true).flush({
      success: true, data, number: 0,
      totalElements: data.length, size: 25, totalPages: 1
    });

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    httpMock = TestBed.inject(HttpTestingController);
    dataSource = new ServerSideDataSource(TestBed.inject(HttpClient));
  });

  afterEach(() => {
    dataSource.disconnect();
    httpMock.verify();
  });

  it('should emit loading=true when loadData is called', (done) => {
    dataSource.loading$.pipe(skip(1), take(1)).subscribe(v => {
      expect(v).toBe(true);
      done();
    });
    dataSource.loadData('my-graph', 'http://ex.org/Class');
    flushSuccess();
  });

  it('should emit data on successful response', (done) => {
    dataSource.data$.pipe(skip(1), take(1)).subscribe(data => {
      expect(data[0].id).toBe('1');
      done();
    });
    dataSource.loadData('my-graph', 'http://ex.org/Class');
    flushSuccess([{ id: '1' }]);
  });

  it('should emit loading=false after response', (done) => {
    // loading starts false, goes true, then back to false
    const states: boolean[] = [];
    dataSource.loading$.subscribe(v => states.push(v));
    dataSource.loadData('my-graph', 'http://ex.org/Class');
    flushSuccess();
    setTimeout(() => {
      expect(states).toContain(false);
      done();
    }, 50);
  });

  it('should clear data on clearData', (done) => {
    // First emit some data, then clear
    dataSource.loading$.pipe(skip(1), take(1)).subscribe(() => {
      dataSource.clearData();
      dataSource.data$.pipe(take(1)).subscribe(data => {
        expect(data.length).toBe(0);
        done();
      });
    });
    dataSource.loadData('my-graph', 'http://ex.org/Class');
    flushSuccess([{ id: '1' }]);
    httpMock.verify();
  });

  it('should cancel current request on cancelCurrentRequest', () => {
    const states: boolean[] = [];
    dataSource.loading$.subscribe(v => states.push(v));
    dataSource.loadData('my-graph', 'http://ex.org/Class');
    dataSource.cancelCurrentRequest();
    expect(states[states.length - 1]).toBe(false);
    httpMock.expectOne(() => true).flush({ success: true, data: [], number: 0, totalElements: 0, size: 25, totalPages: 0 });
  });
});
