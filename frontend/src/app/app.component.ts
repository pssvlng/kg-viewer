import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ContentContainerComponent } from './components/content-container/content-container.component';
import { DocumentUploaderComponent } from './components/document-uploader/document-uploader.component';
import { GraphsViewerComponent } from './components/graphs-viewer/graphs-viewer.component';
import { ResultsComponent } from './components/results/results.component';
import { UploadManagerComponent } from './components/upload-manager/upload-manager.component';
import { UploadProgressComponent } from './components/upload-progress/upload-progress.component';
import { ContentContainerService } from './services/content-container.service';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatTabsModule,
    MatIconModule,
    DocumentUploaderComponent,
    UploadProgressComponent,
    ResultsComponent,
    GraphsViewerComponent,
    ContentContainerComponent,
    UploadManagerComponent
  ],
  template: `
    <header class="app-header">
      <div class="header-inner">
        <div class="header-brand">
          <mat-icon class="brand-icon">device_hub</mat-icon>
          <span class="brand-name">Knowledge Graph Viewer</span>
        </div>
      </div>
    </header>

    <main class="app-main">
      <div class="container">
        <mat-tab-group class="main-tabs" [(selectedIndex)]="selectedTabIndex" animationDuration="180ms">

          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon class="tab-icon">upload_file</mat-icon>
              Upload
            </ng-template>
            <div class="tab-content">
              <app-content-container containerId="upload"></app-content-container>
            </div>
          </mat-tab>

          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon class="tab-icon">account_tree</mat-icon>
              Named Graphs
            </ng-template>
            <div class="tab-content">
              <app-content-container containerId="named-graphs"></app-content-container>
            </div>
          </mat-tab>

        </mat-tab-group>
      </div>
    </main>

    <footer class="app-footer">
      <span>Knowledge Graph Viewer</span>
    </footer>
  `,
  styles: [`
    /* ---- Header ---------------------------------------------------------- */
    .app-header {
      background: #263238;
      color: #eceff1;
      box-shadow: 0 2px 6px rgba(0,0,0,.35);
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .header-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px;
      height: 56px;
      display: flex;
      align-items: center;
    }

    .header-brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-icon {
      font-size: 22px;
      width: 22px;
      height: 22px;
      color: #80cbc4;
    }

    .brand-name {
      font-size: 16px;
      font-weight: 500;
      letter-spacing: 0.3px;
    }

    /* ---- Main ------------------------------------------------------------ */
    .app-main {
      min-height: calc(100vh - 56px - 36px);
    }

    .container {
      max-width: 1200px;
      margin: 24px auto;
      padding: 0 20px;
    }

    .main-tabs {
      margin-top: 0;
    }

    .tab-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      margin-right: 6px;
      vertical-align: middle;
    }

    .tab-content {
      padding: 20px 0;
    }

    /* ---- Footer ---------------------------------------------------------- */
    .app-footer {
      background: #263238;
      color: #78909c;
      font-size: 12px;
      text-align: center;
      padding: 8px 20px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `]
})
export class AppComponent implements OnInit {
  selectedTabIndex = 0;

  constructor(private contentContainerService: ContentContainerService) {}

  ngOnInit() {
    this.initializeNamedGraphsContainer();
    this.initializeUploadContainer();
  }

  private initializeUploadContainer() {
    setTimeout(() => {
      this.contentContainerService.pushContent('upload', {
        component: UploadManagerComponent,
        data: {},
        title: 'Upload'
      });
    });
  }

  private initializeNamedGraphsContainer() {
    setTimeout(() => {
      this.contentContainerService.pushContent('named-graphs', {
        component: GraphsViewerComponent,
        data: {
          useContainerNavigation: true
        },
        title: 'Named Graphs'
      });
    });
  }
}

