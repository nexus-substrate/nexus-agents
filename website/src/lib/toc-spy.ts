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

/** Wire the spy to every `[data-toc-spy]` nav on the page. */
export function initTocSpy(root: Document = document): void {
  if (!('IntersectionObserver' in window)) return;
  for (const nav of root.querySelectorAll<HTMLElement>('[data-toc-spy]')) {
    const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
    const pairs = links.flatMap((link) => {
      const id = decodeURIComponent(link.hash.slice(1));
      const heading = id === '' ? null : root.getElementById(id);
      return heading === null ? [] : [{ link, heading }];
    });
    if (pairs.length === 0) continue;

    let active: HTMLAnchorElement | undefined;
    const update = (): void => {
      const tops = pairs.map((p) => p.heading.getBoundingClientRect().top);
      const index = currentHeadingIndex(tops, window.innerHeight * BAND);
      const next = index === -1 ? undefined : pairs[index]?.link;
      if (next === active) return;
      active?.removeAttribute('aria-current');
      next?.setAttribute('aria-current', 'location');
      active = next;
    };

    const observer = new IntersectionObserver(update, { rootMargin: '0px 0px -66% 0px' });
    for (const { heading } of pairs) observer.observe(heading);
    update();
  }
}
