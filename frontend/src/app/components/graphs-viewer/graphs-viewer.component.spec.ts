import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { GraphsService } from '../../services/graphs.service';
import { GraphsViewerComponent } from './graphs-viewer.component';

describe('GraphsViewerComponent', () => {
  let component: GraphsViewerComponent;
  let fixture: ComponentFixture<GraphsViewerComponent>;
  let graphsServiceSpy: jasmine.SpyObj<GraphsService>;

  const mockGraphsResponse = {
    success: true,
    graphs: [{ name: 'g1', uri: 'http://ex.org/g1', tripleCount: 10 }],
    count: 1,
  };

  beforeEach(async () => {
    graphsServiceSpy = jasmine.createSpyObj('GraphsService', ['getGraphs', 'getGraphAnalysis', 'deleteGraph']);
    graphsServiceSpy.getGraphs.and.returnValue(of(mockGraphsResponse));

    await TestBed.configureTestingModule({
      imports: [GraphsViewerComponent, ReactiveFormsModule, NoopAnimationsModule],
      providers: [
        { provide: GraphsService, useValue: graphsServiceSpy },
        { provide: MatDialog, useValue: { open: jasmine.createSpy('open').and.returnValue({ afterClosed: () => of(null) }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GraphsViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call getGraphs on init', () => {
    expect(graphsServiceSpy.getGraphs).toHaveBeenCalled();
  });

  it('should populate graphs from response', () => {
    expect(component.graphs.length).toBe(1);
    expect(component.graphs[0].name).toBe('g1');
  });

  it('should set loading=false after load completes', () => {
    expect(component.loading).toBe(false);
  });

  it('should set loading=false after data loads synchronously', () => {
    graphsServiceSpy.getGraphs.and.returnValue(of(mockGraphsResponse));
    component.loadGraphs();
    expect(component.loading).toBe(false);
  });

  it('should set loading=false after error', () => {
    graphsServiceSpy.getGraphs.and.returnValue(throwError(() => new Error('Network error')));
    component.loadGraphs();
    expect(component.loading).toBe(false);
  });

  describe('filtering', () => {
    it('should apply filter to data source', () => {
      component.applyFilter('g1');
      expect(component.dataSource.filter).toBe('g1');
    });

    it('should clear filter on clearFilter', () => {
      component.filterControl.setValue('test');
      component.clearFilter();
      expect(component.filterControl.value).toBe('');
    });
  });
});
