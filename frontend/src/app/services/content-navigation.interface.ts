import { EventEmitter, Type } from '@angular/core';

export interface ContentNavigationEvent {
  action: 'push' | 'replace' | 'back';
  component?: Type<any>;
  data?: any;
  title?: string;
}

export interface ContentNavigable {
  contentNavigation?: EventEmitter<ContentNavigationEvent>;
}

export interface ContentFrame {
  id: string;
  component: Type<any>;
  data?: any;
  title: string;
  canGoBack: boolean;
}

export interface ContentStack {
  id: string;
  frames: ContentFrame[];
  currentIndex: number;
}