import { DataSource } from '@angular/cdk/collections';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
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
  private messageSubject = new BehaviorSubject<string | null>(null);
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
  public message$ = this.messageSubject.asObservable();
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

  loadData(
    graphName: string,
    classUri: string,
    page: number = 1,
    pageSize: number = 25,
    filter: string = '',
    graphUri?: string
  ) {
    this.cancelCurrentRequest();
    this.loadingSubject.next(true);

    let params = new HttpParams()
      .set('page', (page - 1).toString()) // Convert to 0-based page number for API
      .set('size', pageSize.toString())
      .set('search', (filter || '').trim());

    if (graphUri) {
      params = params.set('graphUri', graphUri);
    }

    const url = `${environment.apiUrl}/api/graphs/${encodeURIComponent(graphName)}/entities/${encodeURIComponent(classUri)}/instances`;

    this.currentRequest = this.http.get<any>(url, { params }).subscribe({
      next: (response) => {
        console.log('ServerSideDataSource - Page:', page, 'Success:', response.success, 'Message:', response.message, 'Data length:', response.data?.length);
        if (response.success) {
          // Always update data - empty array for pages beyond limit, actual data for valid pages
          this.dataSubject.next(response.data || []);
          // Handle message from backend (e.g., 10k limit message)
          this.messageSubject.next(response.message || null);
          // Convert API response to our pagination format
          const pagination: PaginationInfo = {
            page: (response.number || 0) + 1, // Convert back to 1-based
            pageSize: response.size || pageSize,
            totalItems: response.totalElements || 0,
            totalPages: response.totalPages || 0,
            hasNext: (response.number + 1) < response.totalPages,
            hasPrevious: response.number > 0
          };
          this.paginationSubject.next(pagination);
        } else {
          this.dataSubject.next([]);
          this.messageSubject.next(null);
          console.error('Server returned error:', response.error);
        }
        this.loadingSubject.next(false);
        this.currentRequest = null;
      },
      error: (error) => {
        this.dataSubject.next([]);
        this.messageSubject.next(null);
        this.loadingSubject.next(false);
        console.error('Error loading data:', error);
        this.currentRequest = null;
      }
    });
  }

  getCurrentPagination(): PaginationInfo {
    return this.paginationSubject.value;
  }

  loadSearchData(graphName: string, searchTerm: string, page: number = 1, pageSize: number = 25) {
    // Cancel any ongoing request
    this.cancelCurrentRequest();
    
    this.loadingSubject.next(true);

    const params = new HttpParams()
      .set('q', searchTerm)
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    const url = `${environment.apiUrl}/api/graphs/${encodeURIComponent(graphName)}/search`;

    this.currentRequest = this.http.get<any>(url, { params }).subscribe({
      next: (response) => {
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
        } else {
          this.dataSubject.next([]);
          console.error('Search returned error:', response?.error);
        }
        this.loadingSubject.next(false);
        this.currentRequest = null;
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