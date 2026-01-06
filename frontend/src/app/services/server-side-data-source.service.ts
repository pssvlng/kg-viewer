import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { DataSource } from '@angular/cdk/collections';
import { environment } from '../../environments/environment';

export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface PaginatedResponse {
  success: boolean;
  data: any[];
  pagination: PaginationInfo;
  filter: string;
  error?: string;
}

export class ServerSideDataSource extends DataSource<any> {
  private dataSubject = new BehaviorSubject<any[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private paginationSubject = new BehaviorSubject<PaginationInfo>({
    page: 1,
    pageSize: 50,
    totalItems: 0,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false
  });
  private currentRequest: Subscription | null = null;

  public loading$ = this.loadingSubject.asObservable();
  public pagination$ = this.paginationSubject.asObservable();
  public data$ = this.dataSubject.asObservable();

  constructor(private http: HttpClient) {
    super();
  }

  connect(): Observable<any[]> {
    return this.dataSubject.asObservable();
  }

  disconnect(): void {
    this.dataSubject.complete();
    this.loadingSubject.complete();
    this.paginationSubject.complete();
  }

  cancelCurrentRequest() {
    if (this.currentRequest) {
      this.currentRequest.unsubscribe();
      this.currentRequest = null;
    }
    this.loadingSubject.next(false);
  }

  clearData() {
    this.cancelCurrentRequest();
    this.dataSubject.next([]);
    this.paginationSubject.next({
      page: 1,
      pageSize: 25,
      totalItems: 0,
      totalPages: 0,
      hasNext: false,
      hasPrevious: false
    });
  }

  loadData(graphName: string, classUri: string, page: number = 1, pageSize: number = 25, filter: string = '') {
    this.loadingSubject.next(true);

    const params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString())
      .set('filter', filter);

    const url = `${environment.apiUrl}/api/graphs/${encodeURIComponent(graphName)}/class/${encodeURIComponent(classUri)}/instances`;

    this.http.get<PaginatedResponse>(url, { params }).subscribe({
      next: (response) => {
        if (response.success) {
          this.dataSubject.next(response.data);
          this.paginationSubject.next(response.pagination);
        } else {
          this.dataSubject.next([]);
          console.error('Server returned error:', response.error);
        }
        this.loadingSubject.next(false);
      },
      error: (error) => {
        this.dataSubject.next([]);
        this.loadingSubject.next(false);
        console.error('Error loading data:', error);
      }
    });
  }

  getCurrentPagination(): PaginationInfo {
    return this.paginationSubject.value;
  }

  loadSearchData(graphName: string, searchTerm: string, page: number = 1, pageSize: number = 25) {
    console.log('ServerSideDataSource: Starting search request', { graphName, searchTerm, page, pageSize });
    
    // Cancel any ongoing request
    this.cancelCurrentRequest();
    
    this.loadingSubject.next(true);

    const params = new HttpParams()
      .set('q', searchTerm)
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    const url = `${environment.apiUrl}/api/graphs/${encodeURIComponent(graphName)}/search`;
    console.log('ServerSideDataSource: Making request to:', url, 'with params:', params.toString());

    this.currentRequest = this.http.get<any>(url, { params }).subscribe({
      next: (response) => {
        console.log('ServerSideDataSource: Received response:', response);
        if (response && response.results) {
          this.dataSubject.next(response.results);
          this.paginationSubject.next({
            page: response.page,
            pageSize: response.pageSize,
            totalItems: response.total,
            totalPages: response.totalPages,
            hasNext: response.page < response.totalPages,
            hasPrevious: response.page > 1
          });
          console.log('ServerSideDataSource: Updated data and pagination');
        } else {
          this.dataSubject.next([]);
          console.error('Search returned error:', response?.error);
        }
        this.loadingSubject.next(false);
        this.currentRequest = null;
        console.log('ServerSideDataSource: Loading completed');
      },
      error: (error) => {
        console.error('ServerSideDataSource: HTTP Error:', error);
        this.dataSubject.next([]);
        this.loadingSubject.next(false);
        this.currentRequest = null;
      }
    });
  }
}

@Injectable({
  providedIn: 'root'
})
export class ServerSideDataSourceService {
  constructor(private http: HttpClient) {}

  create(): ServerSideDataSource {
    return new ServerSideDataSource(this.http);
  }
  
  createDataSource(): ServerSideDataSource {
    return new ServerSideDataSource(this.http);
  }
}