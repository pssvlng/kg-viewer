import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UploadFileResponse {
  success: boolean;
  message: string;
  jobId?: string;
  filename?: string;
  graphName?: string;
  triplesCount?: number;
  graphId?: string;
  graphUri?: string;
  sparqlEndpoint?: string;
  tabs?: any[];
  error?: string;
}

export interface UploadJob {
  job_id: string;
  filename: string;
  graph_name: string;
  timestamp: string;
  status: 'processing' | 'failed' | 'success';
  progress: number;
  total_triples: number;
  processed_triples: number;
  current_batch: number;
  total_batches: number;
  error_message?: string;
  result_data?: any;
  analysisProgress?: {
    progress: number;
    status: string;
    timestamp: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  uploadFile(file: File, graphName: string): Observable<UploadFileResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('graphName', graphName);

    return this.http.post<UploadFileResponse>(`${this.apiUrl}/upload_file`, formData);
  }

  getUploadStatus(jobId: string): Observable<UploadJob> {
    return this.http.get<UploadJob>(`${this.apiUrl}/upload/status/${jobId}`);
  }

  getAnalysisProgress(jobId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/upload/analysis_progress/${jobId}`);
  }

  getAllUploadJobs(): Observable<UploadJob[]> {
    return this.http.get<UploadJob[]>(`${this.apiUrl}/upload/jobs`);
  }

  getSparqlEndpoint(): Observable<any> {
    return this.http.get(`${this.apiUrl}/sparql`);
  }

  healthCheck(): Observable<any> {
    return this.http.get(`${this.apiUrl}/health`);
  }
}