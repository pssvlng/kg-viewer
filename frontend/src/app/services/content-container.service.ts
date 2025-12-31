import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { ContentFrame, ContentStack } from './content-navigation.interface';

@Injectable({
  providedIn: 'root'
})
export class ContentContainerService {
  private stacks = new Map<string, ContentStack>();
  private stackUpdates$ = new BehaviorSubject<{ stackId: string; stack: ContentStack | null }>({ 
    stackId: '', 
    stack: null 
  });

  // Create a new content stack for a container
  createStack(containerId: string): ContentStack {
    const stack: ContentStack = {
      id: containerId,
      frames: [],
      currentIndex: -1
    };
    this.stacks.set(containerId, stack);
    return stack;
  }

  // Push a new content frame onto the stack
  pushContent(containerId: string, frame: Omit<ContentFrame, 'id' | 'canGoBack'>): void {
    let stack = this.stacks.get(containerId);
    if (!stack) {
      stack = this.createStack(containerId);
    }

    // Store current component state before pushing new frame
    if (stack.frames.length > 0) {
      const currentFrame = stack.frames[stack.currentIndex];
      // We'll enhance this to capture component state if needed
    }

    const newFrame: ContentFrame = {
      ...frame,
      id: `${containerId}-${Date.now()}`,
      canGoBack: stack.frames.length > 0
    };

    stack.frames.push(newFrame);
    stack.currentIndex = stack.frames.length - 1;
    this.updateStackHeaders(stack);
    this.stackUpdates$.next({ stackId: containerId, stack });
  }

  // Pop the current frame and go back
  goBack(containerId: string): boolean {
    const stack = this.stacks.get(containerId);
    if (!stack || stack.currentIndex <= 0) return false;

    stack.frames.pop();
    stack.currentIndex = stack.frames.length - 1;
    this.updateStackHeaders(stack);
    this.stackUpdates$.next({ stackId: containerId, stack });
    return true;
  }

  // Clear the entire stack
  clearStack(containerId: string): void {
    const stack = this.stacks.get(containerId);
    if (!stack) return;

    stack.frames = [];
    stack.currentIndex = -1;
    this.stackUpdates$.next({ stackId: containerId, stack: null });
  }

  // Replace the entire stack with a single frame
  replaceStack(containerId: string, frame: Omit<ContentFrame, 'id' | 'canGoBack'>): void {
    this.clearStack(containerId);
    this.pushContent(containerId, frame);
  }

  // Get current stack state
  getStack(containerId: string): ContentStack | undefined {
    return this.stacks.get(containerId);
  }

  // Get stack updates observable for a specific container
  getStackUpdates(containerId: string) {
    return this.stackUpdates$.pipe(
      filter(update => update.stackId === containerId),
      map(update => update.stack)
    );
  }

  private updateStackHeaders(stack: ContentStack): void {
    stack.frames.forEach((frame, index) => {
      frame.canGoBack = index > 0;
    });
  }
}