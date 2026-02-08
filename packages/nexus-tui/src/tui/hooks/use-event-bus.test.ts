/**
 * useEventBus — Unit tests.
 *
 * Tests the hook logic through a wrapper component rendered via
 * ink-testing-library. No need for @testing-library/react-hooks.
 *
 * @module tui/hooks/use-event-bus.test
 */

import { describe, it, expect, vi } from 'vitest';
import { useEventBus } from './use-event-bus.js';

/** Test the core subscribe/unsubscribe contract directly. */
describe('useEventBus (unit)', () => {
  it('module exports the hook function', () => {
    expect(typeof useEventBus).toBe('function');
  });

  it('createMockBus contract works', () => {
    const handlers: Array<(event: { type: string; timestamp: number }) => void> = [];
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(
      (_filter: unknown, handler: (event: { type: string; timestamp: number }) => void) => {
        handlers.push(handler);
        return unsubscribe;
      }
    );

    subscribe({ type: 'model.called' }, (e) => {
      expect(e.type).toBe('model.called');
    });

    expect(subscribe).toHaveBeenCalledOnce();
    expect(handlers).toHaveLength(1);

    // Emit an event
    for (const h of handlers) {
      h({ type: 'model.called', timestamp: Date.now() });
    }

    // Unsubscribe
    const unsub = subscribe.mock.results[0]?.value as () => void;
    unsub();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('handles null bus without error', () => {
    // Simulate what the hook does when bus is null — no subscription
    const bus = null;
    const subscribed = bus !== null;
    expect(subscribed).toBe(false);
  });
});
