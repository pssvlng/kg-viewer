import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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

  getEntityGraph(graphName: string, entityUri: string, depth: number = 1, direction: 'outward' | 'inward' | 'both' = 'both'): Observable<GraphData> {
    const encodedGraphName = encodeURIComponent(graphName);
    const encodedEntityUri = encodeURIComponent(entityUri);
    
    return this.http.get<GraphData>(
      `${this.apiUrl}/api/graphs/${encodedGraphName}/entities/${encodedEntityUri}/graph`,
      { 
        params: { 
          depth: depth.toString(),
          maxNodes: '50',
          direction: direction
        }
      }
    );
  }

  getEntityLiterals(graphName: string, entityUri: string): Observable<LiteralProperty[]> {
    const encodedGraphName = encodeURIComponent(graphName);
    const encodedEntityUri = encodeURIComponent(entityUri);
    
    return this.http.get<LiteralProperty[]>(
      `${this.apiUrl}/api/graphs/${encodedGraphName}/entities/${encodedEntityUri}/literals`
    );
  }
}