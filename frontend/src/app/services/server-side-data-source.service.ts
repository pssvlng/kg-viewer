import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
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

  loadData(graphName: string, classUri: string, page: number = 1, pageSize: number = 50, filter: string = '') {
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
}

@Injectable({
  providedIn: 'root'
})
export class ServerSideDataSourceService {
  constructor(private http: HttpClient) {}

  createDataSource(): ServerSideDataSource {
    return new ServerSideDataSource(this.http);
  }
}