import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ContentContainerService } from './content-container.service';

@Component({ template: '' })
class DummyComponent {}

const dummyFrame = { component: DummyComponent, title: 'Test' };

describe('ContentContainerService', () => {
  let service: ContentContainerService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ContentContainerService] });
    service = TestBed.inject(ContentContainerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('createStack', () => {
    it('should create a stack with the given id', () => {
      const stack = service.createStack('container-1');
      expect(stack.id).toBe('container-1');
      expect(stack.frames.length).toBe(0);
      expect(stack.currentIndex).toBe(-1);
    });
  });

  describe('pushContent', () => {
    it('should add a frame to the stack', () => {
      service.createStack('c1');
      service.pushContent('c1', dummyFrame);
      const stack = service.getStack('c1')!;
      expect(stack.frames.length).toBe(1);
      expect(stack.currentIndex).toBe(0);
    });

    it('should set canGoBack=false for first frame', () => {
      service.createStack('c1');
      service.pushContent('c1', dummyFrame);
      const stack = service.getStack('c1')!;
      expect(stack.frames[0].canGoBack).toBe(false);
    });

    it('should set canGoBack=true for subsequent frames', () => {
      service.createStack('c1');
      service.pushContent('c1', dummyFrame);
      service.pushContent('c1', dummyFrame);
      const stack = service.getStack('c1')!;
      expect(stack.frames[1].canGoBack).toBe(true);
    });

    it('should auto-create stack if not exists', () => {
      service.pushContent('new-container', dummyFrame);
      const stack = service.getStack('new-container')!;
      expect(stack).toBeTruthy();
    });
  });

  describe('goBack', () => {
    it('should decrement currentIndex', () => {
      service.createStack('c1');
      service.pushContent('c1', dummyFrame);
      service.pushContent('c1', dummyFrame);
      service.goBack('c1');
      const stack = service.getStack('c1')!;
      expect(stack.currentIndex).toBe(0);
    });

    it('should not go below 0', () => {
      service.createStack('c1');
      service.pushContent('c1', dummyFrame);
      service.goBack('c1');
      const stack = service.getStack('c1')!;
      expect(stack.currentIndex).toBe(0);
    });
  });

  describe('getStackUpdates', () => {
    it('should emit when content is pushed', (done) => {
      service.createStack('c1');
      service.getStackUpdates('c1').subscribe((stack: any) => {
        if (stack && stack.frames.length > 0) {
          expect(stack.id).toBe('c1');
          done();
        }
      });
      service.pushContent('c1', dummyFrame);
    });
  });
});
