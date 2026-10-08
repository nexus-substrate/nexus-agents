/**
 * toc-spy.ts — in-page nav scroll-spy logic (#7285, USWDS in-page
 * navigation). The DOM binding is the TocSpy.svelte island (#7313); this
 * module holds the decisions, so they are unit-tested without a browser.
 *
 * Marks the in-page nav link of the section being read with
 * aria-current="location". An IntersectionObserver whose root is shrunk to
 * the top third of the viewport (rootMargin "0px 0px -66% 0px") fires as a
 * heading enters or leaves that band; on each callback the current heading is
 * the last one, in document order, whose top has crossed the band's lower
 * edge. Nothing scrolls, so there is no motion to reduce. Without JS (or
 * without IntersectionObserver) the nav is a static list of links.
 *
 * Following a link pins the mark to its target. A short section near the end
 * of a page never reaches the band, so the observer alone marked the section
 * ABOVE the one just clicked. The pin holds through the jump scroll and is
 * released by the reader's next own scroll (wheel, touch, scroll key, or a
 * press that could start a scrollbar drag); the observer then takes over.
 *
 * @module website/lib/toc-spy
 */

/** The band is the top 34% of the viewport: the share of its height above the line. */
export const BAND = 0.34;

/** The observer's rootMargin for that band: the bottom 66% is cut off. */
export const BAND_ROOT_MARGIN = '0px 0px -66% 0px';

/**
 * Index of the last heading whose top (viewport px) is at or above `line`,
 * or -1 when none has crossed it yet (the reader is above the first one).
 */
export function currentHeadingIndex(tops: readonly number[], line: number): number {
  let current = -1;
  tops.forEach((top, i) => {
    if (top <= line) current = i;
  });
  return current;
}

export interface SpyState {
  /** Index of the marked link; -1 for none. */
  active: number;
  /** True from a link jump until the reader's next own scroll. */
  pinned: boolean;
}

export type SpyEvent =
  | { type: 'observed'; index: number }
  | { type: 'navigated'; index: number }
  | { type: 'user-scroll' };

export const INITIAL_SPY: SpyState = { active: -1, pinned: false };

export function spyReduce(state: SpyState, event: SpyEvent): SpyState {
  switch (event.type) {
    case 'navigated':
      return event.index === -1 ? state : { active: event.index, pinned: true };
    case 'observed':
      return state.pinned ? state : { active: event.index, pinned: false };
    case 'user-scroll':
      return { ...state, pinned: false };
  }
}

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

/** Keys that scroll the page; Tab and Enter (following a link) do not. */
export function isScrollKey(key: string): boolean {
  return SCROLL_KEYS.has(key);
}
