/**
 * toc-spy.ts — in-page nav scroll-spy (#7285, USWDS in-page navigation).
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
 * @module website/src/lib/toc-spy
 */

/** Matches the observer's rootMargin: the band is the top 34% of the viewport. */
const BAND = 0.34;

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

interface SpyPair {
  link: HTMLAnchorElement;
  heading: HTMLElement;
}

/** Calls `onScroll` on each input that can start a scroll the reader made. */
function onUserScroll(onScroll: () => void): void {
  window.addEventListener('wheel', onScroll, { passive: true });
  window.addEventListener('touchmove', onScroll, { passive: true });
  window.addEventListener('mousedown', onScroll);
  window.addEventListener('keydown', (e) => {
    if (isScrollKey(e.key)) onScroll();
  });
}

function spyOn(pairs: readonly SpyPair[]): void {
  let state = INITIAL_SPY;
  const dispatch = (event: SpyEvent): void => {
    const before = state.active;
    state = spyReduce(state, event);
    if (state.active === before) return;
    pairs.forEach(({ link }, i) => {
      if (i === state.active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  const update = (): void => {
    const tops = pairs.map((p) => p.heading.getBoundingClientRect().top);
    dispatch({ type: 'observed', index: currentHeadingIndex(tops, window.innerHeight * BAND) });
  };
  const navigated = (hash: string): void => {
    const id = decodeURIComponent(hash.slice(1));
    const index = id === '' ? -1 : pairs.findIndex((p) => p.heading.id === id);
    dispatch({ type: 'navigated', index });
  };

  // Click as well as hashchange: re-clicking the current hash fires no
  // hashchange, and the pin must still be set.
  for (const { link } of pairs) {
    link.addEventListener('click', () => {
      navigated(link.hash);
    });
  }
  window.addEventListener('hashchange', () => {
    navigated(window.location.hash);
  });
  onUserScroll(() => {
    if (!state.pinned) return;
    dispatch({ type: 'user-scroll' });
    update();
  });

  const observer = new IntersectionObserver(update, { rootMargin: '0px 0px -66% 0px' });
  for (const { heading } of pairs) observer.observe(heading);
  update();
  // A page opened at a section's URL starts pinned to it.
  navigated(window.location.hash);
}

/** Wire the spy to every `[data-toc-spy]` nav on the page. */
export function initTocSpy(root: Document = document): void {
  if (!('IntersectionObserver' in window)) return;
  for (const nav of root.querySelectorAll<HTMLElement>('[data-toc-spy]')) {
    const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
    const pairs = links.flatMap((link): SpyPair[] => {
      const id = decodeURIComponent(link.hash.slice(1));
      const heading = id === '' ? null : root.getElementById(id);
      return heading === null ? [] : [{ link, heading }];
    });
    if (pairs.length > 0) spyOn(pairs);
  }
}
