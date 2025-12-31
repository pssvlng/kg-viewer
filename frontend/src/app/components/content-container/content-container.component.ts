import { Component, Input, OnInit, OnDestroy, ViewContainerRef, ViewChild, ComponentRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ContentContainerService } from '../../services/content-container.service';
import { ContentFrame, ContentNavigable } from '../../services/content-navigation.interface';
import { Subscription } from 'rxjs';

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
      <!-- Header with back button (only shown when needed) -->
            <!-- Content header with back button -->
      <div class="content-header" *ngIf="currentFrame">
        <div class="header-content">
          <button 
            mat-raised-button
            color="primary"
            class="back-button"
            (click)="goBack()" 
            *ngIf="currentFrame.canGoBack"
            [attr.aria-label]="'Go back from ' + currentFrame.title">
            <mat-icon>arrow_back</mat-icon>
            Back
          </button>
          <h3 class="content-title">{{ currentFrame?.title }}</h3>
        </div>
      </div>
      
      <!-- Dynamic content area -->
      <div class="content-body">
        <ng-container #contentHost></ng-container>
      </div>
      
      <!-- Placeholder when no content -->
      <div *ngIf="!currentFrame" class="empty-container">
        <mat-icon>info</mat-icon>
        <p>No content to display</p>
      </div>
    </div>
  `,
  styles: [`
    .content-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 400px;
    }

    .content-header {
      border-bottom: 1px solid #e0e0e0;
      padding: 16px;
      background-color: #fafafa;
      flex-shrink: 0;
    }

    .header-content {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .back-button {
      color: #1976d2;
    }

    .content-title {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 500;
      color: #333;
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
export class ContentContainerComponent implements OnInit, OnDestroy {
  @Input() containerId!: string;
  @ViewChild('contentHost', { read: ViewContainerRef }) contentHost!: ViewContainerRef;

  currentFrame: ContentFrame | null = null;
  private subscription = new Subscription();
  private currentComponentRef: ComponentRef<any> | null = null;

  constructor(private contentService: ContentContainerService) {}

  ngOnInit() {
    if (!this.containerId) {
      console.warn('ContentContainerComponent: containerId is required');
      return;
    }

    // Create stack for this container
    this.contentService.createStack(this.containerId);

    // Subscribe to stack updates
    this.subscription.add(
      this.contentService.getStackUpdates(this.containerId).subscribe(stack => {
        if (stack && stack.currentIndex >= 0) {
          this.currentFrame = stack.frames[stack.currentIndex];
          this.renderCurrentFrame();
        } else {
          this.currentFrame = null;
          this.clearContent();
        }
      })
    );
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    this.clearContent();
  }

  goBack() {
    this.contentService.goBack(this.containerId);
  }

  private renderCurrentFrame() {
    if (!this.currentFrame || !this.contentHost) return;

    this.clearContent();
    
    // Create component dynamically
    this.currentComponentRef = this.contentHost.createComponent(this.currentFrame.component);
    
    // Pass data to component if available - BEFORE change detection
    if (this.currentFrame.data) {
      Object.assign(this.currentComponentRef.instance, this.currentFrame.data);
      
      // Force trigger any necessary updates after data assignment
      if (typeof this.currentComponentRef.instance.onDataAssigned === 'function') {
        this.currentComponentRef.instance.onDataAssigned();
      }
    }

    // Wire up navigation if component implements ContentNavigable
    if (this.isContentNavigable(this.currentComponentRef.instance)) {
      this.currentComponentRef.instance.contentNavigation?.subscribe((event: any) => {
        this.handleContentNavigation(event);
      });
    }

    // Trigger change detection
    this.currentComponentRef.changeDetectorRef.detectChanges();
  }

  private clearContent() {
    if (this.currentComponentRef) {
      this.currentComponentRef.destroy();
      this.currentComponentRef = null;
    }
    if (this.contentHost) {
      this.contentHost.clear();
    }
  }

  private isContentNavigable(instance: any): instance is ContentNavigable {
    return instance && typeof instance.contentNavigation?.subscribe === 'function';
  }

  private handleContentNavigation(event: any) {
    switch (event.action) {
      case 'push':
        this.contentService.pushContent(this.containerId, {
          component: event.component,
          data: event.data,
          title: event.title
        });
        break;
      case 'replace':
        this.contentService.replaceStack(this.containerId, {
          component: event.component,
          data: event.data,
          title: event.title
        });
        break;
      case 'back':
        // If there's restore state data, update the frame before going back
        if (event.data?.restoreState) {
          const stack = this.contentService.getStack(this.containerId);
          if (stack && stack.currentIndex > 0) {
            const previousFrame = stack.frames[stack.currentIndex - 1];
            console.log('Restoring state to previous frame:', event.data.restoreState);
            console.log('Previous frame data before merge:', previousFrame.data);
            
            // Merge the restore state into the previous frame's data
            // Extract the actual properties from the restoreState object
            const restoreData = event.data.restoreState;
            previousFrame.data = { 
              ...previousFrame.data, 
              // Spread the properties from restoreState (e.g. results, currentTabIndex)
              ...(restoreData || {})
            };
            
            console.log('Previous frame data after merge:', previousFrame.data);
          }
        }
        this.goBack();
        break;
    }
  }
}