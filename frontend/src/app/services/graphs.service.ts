import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Graph {
  name: string;
  uri: string;
  tripleCount?: number;
}

export interface GraphsResponse {
  success: boolean;
  graphs: Graph[];
  count: number;
}

export interface GraphAnalysisResponse {
  success: boolean;
  graphName: string;
  graphUri: string;
  tabs: any[];
  analysis?: any;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GraphsService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getGraphs(): Observable<GraphsResponse> {
    return this.http.get<GraphsResponse>(`${this.apiUrl}/api/graphs`);
  }

  getGraphAnalysis(graphName: string): Observable<GraphAnalysisResponse> {
    return this.http.get<GraphAnalysisResponse>(`${this.apiUrl}/api/graphs/${encodeURIComponent(graphName)}/analysis`);
  }

  deleteGraph(graphName: string): Observable<{success: boolean, message: string}> {
    return this.http.delete<{success: boolean, message: string}>(`${this.apiUrl}/api/graphs/${encodeURIComponent(graphName)}`);
  }
}