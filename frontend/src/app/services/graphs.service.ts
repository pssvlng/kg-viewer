import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
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

  getGraphAnalysis(graphName: string, graphUri?: string): Observable<GraphAnalysisResponse> {
    let params = new HttpParams();
    if (graphUri) {
      params = params.set('graphUri', graphUri);
    }

    return this.http.get<GraphAnalysisResponse>(
      `${this.apiUrl}/api/graphs/${encodeURIComponent(graphName)}/analysis`,
      { params }
    );
  }

  deleteGraph(graphName: string, graphUri?: string): Observable<{success: boolean, message: string}> {
    let params = new HttpParams();
    if (graphUri) {
      params = params.set('graphUri', graphUri);
    }

    return this.http.delete<{success: boolean, message: string}>(
      `${this.apiUrl}/api/graphs/${encodeURIComponent(graphName)}`,
      { params }
    );
  }
}