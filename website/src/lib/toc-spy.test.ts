import { describe, expect, it } from 'vitest';
import {
  BAND,
  BAND_ROOT_MARGIN,
  currentHeadingIndex,
  INITIAL_SPY,
  isScrollKey,
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
