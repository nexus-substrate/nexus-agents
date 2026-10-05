import { describe, expect, it } from 'vitest';
import { CollaborationEventBus } from '../collaboration/event-bus.js';
import * as observerModule from './orchestration-observer.js';
import * as observerExports from './index.js';

describe('orchestration observer exports', () => {
  it.each([
    ['implementation', observerModule],
    ['barrel', observerExports],
  ])('exports only the canonical observer names from the %s', (_name, exports) => {
    expect(exports).not.toHaveProperty('SwarmObserver');
    expect(exports).not.toHaveProperty('createSwarmObserver');
    expect(exports.OrchestrationObserver).toBe(observerModule.OrchestrationObserver);
    const observer = exports.createOrchestrationObserver(new CollaborationEventBus());
    expect(observer).toBeInstanceOf(exports.OrchestrationObserver);
    expect(observer.isActive()).toBe(false);
  });
});
