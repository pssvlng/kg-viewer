import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface GraphNode {
  id: string;
  label: string;
  uri: string;
  type?: string;
  isCentral?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  uri: string;
}

export interface LiteralProperty {
  predicate: string;
  predicateLabel?: string;
  value: string;
  datatype?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centralNode: string;
  literals?: LiteralProperty[];
}

@Injectable({
  providedIn: 'root'
})
export class GraphVisualizationService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getEntityGraph(
    graphName: string,
    entityUri: string,
    depth: number = 1,
    direction: 'outward' | 'inward' | 'both' = 'both',
    graphUri?: string
  ): Observable<GraphData> {
    const encodedGraphName = encodeURIComponent(graphName);
    const encodedEntityUri = encodeURIComponent(entityUri);
    let params = new HttpParams()
      .set('depth', depth.toString())
      .set('maxNodes', '50')
      .set('direction', direction);

    if (graphUri) {
      params = params.set('graphUri', graphUri);
    }
    
    return this.http.get<GraphData>(
      `${this.apiUrl}/api/graphs/${encodedGraphName}/entities/${encodedEntityUri}/graph`,
      { params }
    );
  }

  getEntityLiterals(graphName: string, entityUri: string, graphUri?: string): Observable<LiteralProperty[]> {
    const encodedGraphName = encodeURIComponent(graphName);
    const encodedEntityUri = encodeURIComponent(entityUri);
    let params = new HttpParams();

    if (graphUri) {
      params = params.set('graphUri', graphUri);
    }
    
    return this.http.get<LiteralProperty[]>(
      `${this.apiUrl}/api/graphs/${encodedGraphName}/entities/${encodedEntityUri}/literals`,
      { params }
    );
  }
}