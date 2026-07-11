import { ChangeDetectorRef, ElementRef } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { GraphViewerComponent } from './graph-viewer.component';
import { GraphVisualizationService } from '../../services/graph-visualization.service';

describe('GraphViewerComponent', () => {
  let component: GraphViewerComponent;

  beforeEach(() => {
    const graphServiceSpy = jasmine.createSpyObj<GraphVisualizationService>('GraphVisualizationService', [
      'getEntityGraph',
      'getEntityLiterals',
    ]);
    const cdSpy = jasmine.createSpyObj<ChangeDetectorRef>('ChangeDetectorRef', ['detectChanges']);
    const hostEl = document.createElement('div');

    component = new GraphViewerComponent(
      graphServiceSpy,
      cdSpy,
      { nativeElement: hostEl } as ElementRef,
      document as Document
    );
  });

  it('should reset expanded graph state when max edges selection changes', () => {
    component.expandedNodes.add('node-1');
    component.expandedNodesData.set('node-1', { nodes: [], edges: [] });
    component.lastSelectedNode = 'node-1';

    spyOn(component, 'loadGraph');

    component.onMaxEdgesChange();

    expect(component.expandedNodes.size).toBe(0);
    expect(component.expandedNodesData.size).toBe(0);
    expect(component.lastSelectedNode).toBeNull();
    expect(component.loadGraph).toHaveBeenCalledTimes(1);
  });

  it('should default max edges selection to 50', () => {
    expect(component.maxEdgesSelection).toBe(50);
  });
});
