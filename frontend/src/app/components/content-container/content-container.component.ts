import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ComponentRef, ElementRef, Input, OnDestroy, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { ContentContainerService } from '../../services/content-container.service';
import { ContentFrame, ContentNavigable } from '../../services/content-navigation.interface';
import { GraphViewerComponent } from '../graph-viewer/graph-viewer.component';
import { ResultsComponent } from '../results/results.component';

@Component({
  selector: 'app-content-container',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <div class="content-container">
      <!-- Content header with back button -->
      <div class="content-header" *ngIf="currentComponentIndex > 0">
        <div class="header-content">
          <button 
            mat-raised-button
            color="primary"
            class="back-button"
            (click)="goBack()" 
            aria-label="Go back">
            <mat-icon>arrow_back</mat-icon>
            Back
          </button>
          <h3 class="content-title">{{ getCurrentTitle() }}</h3>
        </div>
      </div>
      
      <!-- Original component (index 0) - GraphsViewer, etc. -->
      <div class="content-body" 
           [style.display]="currentComponentIndex === 0 ? 'block' : 'none'">
        <ng-container #resultsHost></ng-container>
      </div>
      
      <!-- Navigated results component (index 1) -->
      <div class="content-body" 
           [style.display]="currentComponentIndex === 1 ? 'block' : 'none'">
        <ng-container #navigatedResultsHost></ng-container>
      </div>
      
      <!-- Graph viewer component (index 2) -->
      <div class="content-body" 
           [style.display]="currentComponentIndex === 2 ? 'block' : 'none'">
        <ng-container #graphHost></ng-container>
      </div>
      
      <!-- Placeholder when no content -->
      <div *ngIf="!hasContent" class="empty-container">
        <mat-icon>info</mat-icon>
        <p>No content to display</p>
      </div>
    </div>
  `,
  styles: [`
    .content-container {
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .content-header {
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
      padding: 0;
    }

    .header-content {
      display: flex;
      align-items: center;
      padding: 16px;
      gap: 16px;
    }

    .content-title {
      margin: 0;
      flex: 1;
      font-size: 18px;
      font-weight: 500;
    }

    .back-button {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .content-body {
      flex: 1;
      overflow: auto;
    }

    .empty-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      color: #666;
      flex: 1;
    }

    .empty-container mat-icon {
      font-size: 48px;
      height: 48px;
      width: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }
  `]
})
export class ContentContainerComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() containerId!: string;
  @ViewChild('resultsHost', { read: ViewContainerRef }) resultsHost!: ViewContainerRef;
  @ViewChild('navigatedResultsHost', { read: ViewContainerRef }) navigatedResultsHost!: ViewContainerRef;
  @ViewChild('graphHost', { read: ViewContainerRef }) graphHost!: ViewContainerRef;

  // Index-based component management
  currentComponentIndex = 0;  // 0: original, 1: navigated results, 2: graph view
  hasContent = false;
  
  // Track titles for each index
  private componentTitles: string[] = ['', '', ''];
  
  // Track original component for back navigation
  private originalComponentRef: ComponentRef<any> | null = null;
  
  // Component references
  private resultsComponentRef: ComponentRef<any> | null = null;
  private navigatedResultsComponentRef: ComponentRef<any> | null = null;
  private graphComponentRef: ComponentRef<any> | null = null;
  
  private subscription = new Subscription();
  private scrollResetTimer: number | null = null;

  constructor(
    private contentService: ContentContainerService,
    private el: ElementRef<HTMLElement>
  ) {}

  ngOnInit() {
    if (!this.containerId) {
      console.warn('ContentContainerComponent: containerId is required');
      return;
    }

    // Create stack for this container to maintain compatibility with existing service
    this.contentService.createStack(this.containerId);

    // Subscribe to stack updates to get initial results component
    this.subscription.add(
      this.contentService.getStackUpdates(this.containerId).subscribe(stack => {
        if (stack && stack.frames.length > 0 && !this.resultsComponentRef) {
          this.initializeResultsComponent(stack.frames[0]);
        }
      })
    );
  }

  ngAfterViewInit() {
    this.resetActiveScrollPosition();
  }

  ngOnDestroy() {
    if (this.scrollResetTimer !== null) {
      window.clearTimeout(this.scrollResetTimer);
      this.scrollResetTimer = null;
    }
    this.subscription.unsubscribe();
    this.clearComponents();
  }

  private initializeResultsComponent(frame: ContentFrame) {
    if (!this.resultsHost || this.resultsComponentRef) return;
    
    // Create initial component (can be Results, GraphsViewer, etc.)
    this.resultsComponentRef = this.resultsHost.createComponent(frame.component);
    
    // Store reference to original component for back navigation
    this.originalComponentRef = this.resultsComponentRef;
    
    // Pass data to component
    if (frame.data) {
      Object.assign(this.resultsComponentRef.instance, frame.data);
    }
    
    // Wire up navigation events
    if (this.isContentNavigable(this.resultsComponentRef.instance)) {
      const navSub = this.resultsComponentRef.instance.contentNavigation?.subscribe((event: any) => {
        this.handleNavigationEvent(event);
      });
      if (navSub) {
        this.subscription.add(navSub);
      }
    }
    
    this.resultsComponentRef.changeDetectorRef.detectChanges();
    this.hasContent = true;
    
    // Set initial state - index 0 for original component
    this.currentComponentIndex = 0;
    this.componentTitles[0] = frame.title || 'Initial View';
    this.resetActiveScrollPosition();
  }

  getCurrentTitle(): string {
    return this.componentTitles[this.currentComponentIndex] || '';
  }

  goBack() {
    if (this.currentComponentIndex > 0) {
      this.currentComponentIndex--;
      this.resetActiveScrollPosition();
    }
  }

  private handleNavigationEvent(event: any) {
    if (event.action === 'push') {
      if (event.component === GraphViewerComponent) {
        // Show graph viewer
        this.showGraphViewer(event.data, event.title);
      } else if (event.component === ResultsComponent) {
        // Replace current results component with new results data
        this.showResultsComponent(event.data, event.title);
      }
    }
  }

  private showResultsComponent(data: any, title?: string) {
    // Clear existing navigated results
    if (this.navigatedResultsComponentRef) {
      this.navigatedResultsComponentRef.destroy();
      this.navigatedResultsComponentRef = null;
    }

    // Create new ResultsComponent in the navigated results container
    if (this.navigatedResultsHost) {
      this.navigatedResultsComponentRef = this.navigatedResultsHost.createComponent(ResultsComponent);
      
      // Pass data to results component
      if (data) {
        Object.assign(this.navigatedResultsComponentRef.instance, data);
      }
      
      // Wire up navigation for graph viewing from results
      if (this.isContentNavigable(this.navigatedResultsComponentRef.instance)) {
        const navSub = this.navigatedResultsComponentRef.instance.contentNavigation?.subscribe((event: any) => {
          this.handleNavigationEvent(event);
        });
        if (navSub) {
          this.subscription.add(navSub);
        }
      }
      
      this.navigatedResultsComponentRef.changeDetectorRef.detectChanges();
    }
    
    // Navigate to index 1 (navigated results)
    this.currentComponentIndex = 1;
    this.componentTitles[1] = title || 'Results';
    this.resetActiveScrollPosition();
  }

  private showGraphViewer(data: any, title?: string) {
    // Always destroy and recreate graph viewer to ensure fresh data
    if (this.graphComponentRef) {
      this.graphComponentRef.destroy();
      this.graphComponentRef = null;
    }
    
    // Create fresh graph viewer component
    if (this.graphHost) {
      this.graphComponentRef = this.graphHost.createComponent(GraphViewerComponent);
      
      // Pass data to graph viewer BEFORE setting up navigation
      if (data) {
        Object.assign(this.graphComponentRef.instance, data);
      }
      
      // Wire up back navigation - listen to the contentNavigation event
      if (this.isContentNavigable(this.graphComponentRef.instance)) {
        const navSub = this.graphComponentRef.instance.contentNavigation?.subscribe((event: any) => {
          if (event.action === 'back') {
            // Simply go back one index
            this.goBack();
          }
        });
        if (navSub) {
          this.subscription.add(navSub);
        }
      }
      
      // Trigger change detection and component initialization
      this.graphComponentRef.changeDetectorRef.detectChanges();
    }
    
    // Navigate to index 2 (graph view)
    this.currentComponentIndex = 2;
    this.componentTitles[2] = title || 'Graph View';
    this.resetActiveScrollPosition();
  }

  private clearComponents() {
    if (this.resultsComponentRef) {
      this.resultsComponentRef.destroy();
      this.resultsComponentRef = null;
    }
    if (this.navigatedResultsComponentRef) {
      this.navigatedResultsComponentRef.destroy();
      this.navigatedResultsComponentRef = null;
    }
    if (this.graphComponentRef) {
      this.graphComponentRef.destroy();
      this.graphComponentRef = null;
    }
    this.originalComponentRef = null;
    this.currentComponentIndex = 0;
    this.componentTitles = ['', '', ''];
  }

  private isContentNavigable(instance: any): instance is ContentNavigable {
    return instance && typeof instance.contentNavigation?.subscribe === 'function';
  }

  private resetActiveScrollPosition() {
    if (this.scrollResetTimer !== null) {
      window.clearTimeout(this.scrollResetTimer);
    }

    this.scrollResetTimer = window.setTimeout(() => {
      const contentBodies = this.el.nativeElement.querySelectorAll('.content-body');
      const activeBody = contentBodies.item(this.currentComponentIndex) as HTMLElement | null;
      if (activeBody) {
        activeBody.scrollTop = 0;
        activeBody.scrollLeft = 0;
      }

      this.scrollResetTimer = null;
    }, 0);
  }
}