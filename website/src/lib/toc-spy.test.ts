import { describe, expect, it } from 'vitest';
import {
  BAND,
  BAND_ROOT_MARGIN,
  currentHeadingIndex,
  INITIAL_SPY,
  isScrollKey,
  listenScrollEnd,
  spyReduce,
  type SpyState,
} from './toc-spy.ts';

describe('currentHeadingIndex', () => {
  it('is -1 for no headings', () => {
    expect(currentHeadingIndex([], 300)).toBe(-1);
  });

  it('is -1 while every heading is still below the line (the page top)', () => {
    expect(currentHeadingIndex([400, 900], 300)).toBe(-1);
  });

  it('picks the last heading that has crossed the line, in document order', () => {
    expect(currentHeadingIndex([-800, -20, 250, 700], 300)).toBe(2);
    expect(currentHeadingIndex([-800, -20, 310, 700], 300)).toBe(1);
  });

  it('counts a heading exactly on the line as crossed', () => {
    expect(currentHeadingIndex([300], 300)).toBe(0);
  });
});

describe('spyReduce', () => {
  const at = (active: number, pinned = false): SpyState => ({ active, pinned });

  it('starts with no section marked and nothing pinned', () => {
    expect(INITIAL_SPY).toEqual(at(-1));
  });

  it('follows the observer while nothing is pinned', () => {
    expect(spyReduce(at(0), { type: 'observed', index: 2 })).toEqual(at(2));
  });

  it('marks the target of a click or hash change and pins it', () => {
    expect(spyReduce(at(0), { type: 'navigated', index: 5 })).toEqual(at(5, true));
  });

  it('keeps the pinned target while the jump scroll reports another section', () => {
    // A short last section never reaches the band, so the observer names the
    // section above it; that is the defect this pin exists for.
    const pinned = spyReduce(at(0), { type: 'navigated', index: 5 });
    expect(spyReduce(pinned, { type: 'observed', index: 4 })).toEqual(at(5, true));
  });

  it('releases the pin on the next user scroll, then follows the observer again', () => {
    const released = spyReduce(at(5, true), { type: 'user-scroll' });
    expect(released).toEqual(at(5));
    expect(spyReduce(released, { type: 'observed', index: 4 })).toEqual(at(4));
  });

  it('ignores a navigation to a target that is not in the nav', () => {
    expect(spyReduce(at(1), { type: 'navigated', index: -1 })).toEqual(at(1));
  });
});

describe('isScrollKey', () => {
  it('treats the keyboard scroll keys as a user scroll', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']) {
      expect(isScrollKey(key), key).toBe(true);
    }
  });

  it('does not treat Tab or Enter (following a link) as one', () => {
    expect(isScrollKey('Tab')).toBe(false);
    expect(isScrollKey('Enter')).toBe(false);
  });
});

describe('the band', () => {
  it('cuts off exactly the part of the viewport below the line', () => {
    const below = String(Math.round((1 - BAND) * 100));
    expect(BAND_ROOT_MARGIN).toBe(`0px 0px -${below}% 0px`);
  });
});

describe('fast scroll across the band', () => {
  it('chooses the last heading above the band bottom when multiple headings jump across the band', () => {
    const bandBottom = 300;
    // Fast wheel or PageDown jumped H0, H1, H2 above the band; H3 is above the band bottom; H4 is below.
    expect(currentHeadingIndex([-1200, -700, -200, 150, 500], bandBottom)).toBe(3);
  });

  it('chooses the last heading when all headings have jumped above the band', () => {
    const bandBottom = 300;
    expect(currentHeadingIndex([-1200, -700, -200, -50, 100], bandBottom)).toBe(4);
  });
});

describe('listenScrollEnd', () => {
  class FakeTarget implements EventTarget {
    private readonly listeners: Record<string, EventListenerOrEventListenerObject[]> = {};

    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
      if (!listener) return;
      (this.listeners[type] ??= []).push(listener);
    }

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
      if (!listener) return;
      this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== listener);
    }

    dispatchEvent(_event: Event): boolean {
      return true;
    }

    fire(type: string, event: Event = new Event(type)): void {
      for (const listener of this.listeners[type] ?? []) {
        if (typeof listener === 'function') listener(event);
        else listener.handleEvent(event);
      }
    }

    count(type: string): number {
      return (this.listeners[type] ?? []).length;
    }
  }

  it('uses native scrollend when available, and cleans up on unbind', () => {
    const target = new FakeTarget();
    let called = 0;
    const unbind = listenScrollEnd(target, () => { called += 1; }, { native: true });

    expect(target.count('scrollend')).toBe(1);
    expect(target.count('scroll')).toBe(0);

    target.fire('scrollend');
    expect(called).toBe(1);

    unbind();
    expect(target.count('scrollend')).toBe(0);
    target.fire('scrollend');
    expect(called).toBe(1);
  });

  it('falls back to rAF-throttled scroll when native scrollend is unavailable', () => {
    const target = new FakeTarget();
    let called = 0;
    let rafCallbacks: FrameRequestCallback[] = [];
    let nextId = 1;
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCancel = globalThis.cancelAnimationFrame;

    globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      const id = nextId++;
      rafCallbacks.push(cb);
      return id;
    };
    globalThis.cancelAnimationFrame = (_id: number): void => {
      rafCallbacks = [];
    };

    try {
      const unbind = listenScrollEnd(target, () => { called += 1; }, { native: false });
      expect(target.count('scroll')).toBe(1);
      expect(target.count('scrollend')).toBe(0);

      // Multiple scroll events before rAF flushes are coalesced
      target.fire('scroll');
      target.fire('scroll');
      target.fire('scroll');
      expect(called).toBe(0);
      expect(rafCallbacks.length).toBe(1);

      // Flush the animation frame
      const cb = rafCallbacks.pop()!;
      cb(100);
      expect(called).toBe(1);

      // Unbind removes listener and cancels pending frame
      target.fire('scroll');
      expect(rafCallbacks.length).toBe(1);
      unbind();
      expect(target.count('scroll')).toBe(0);
      expect(rafCallbacks.length).toBe(0);
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
      globalThis.cancelAnimationFrame = originalCancel;
    }
  });
});

