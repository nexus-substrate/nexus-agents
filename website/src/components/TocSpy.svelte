<script lang="ts">
  // In-page nav scroll-spy (#7285), a Svelte island since #7313. It wraps
  // the server-rendered "On this page" <nav> (DocsLayout.astro), passed in
  // as the default slot: Astro renders the slot into the island's HTML and,
  // on hydration, Svelte adopts those nodes rather than re-creating them, so
  // there is one copy of the nav and without JS it is the same static list.
  // The pre-paint disclosure sync in DocsLayout runs on these same nodes.
  //
  // Marks the link of the section being read with aria-current="location".
  // An IntersectionObserver whose root is shrunk to the top third of the
  // viewport fires as a heading enters or leaves that band; the current
  // heading is the last one, in document order, whose top has crossed the
  // band's lower edge. Following a link pins the mark to its target until
  // the reader's next own scroll. Nothing scrolls, so there is no motion to
  // reduce. The decisions are pure and live in lib/toc-spy.ts.
  import { onMount, type Snippet } from 'svelte';
  import {
    BAND,
    BAND_ROOT_MARGIN,
    INITIAL_SPY,
    currentHeadingIndex,
    isScrollKey,
    spyReduce,
    type SpyEvent,
  } from '../lib/toc-spy.ts';

  interface Props {
    children?: Snippet;
  }

  const { children }: Props = $props();

  // display: contents, so the wrapper adds no box and the nav keeps its
  // place in the article's layout.
  let root: HTMLElement | undefined;

  interface SpyPair {
    link: HTMLAnchorElement;
    heading: HTMLElement;
  }

  function pairsIn(container: HTMLElement): SpyPair[] {
    const links = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
    return links.flatMap((link): SpyPair[] => {
      const id = decodeURIComponent(link.hash.slice(1));
      const heading = id === '' ? null : document.getElementById(id);
      return heading === null ? [] : [{ link, heading }];
    });
  }

  onMount(() => {
    if (root === undefined || !('IntersectionObserver' in window)) return;
    const pairs = pairsIn(root);
    if (pairs.length === 0) return;

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
    const onClick = (event: MouseEvent): void => {
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      const pair = link ? pairs.find((p) => p.link === link) : undefined;
      if (pair) navigated(pair.link.hash);
    };
    const onHashChange = (): void => navigated(window.location.hash);
    // Each input that can start a scroll the reader made releases the pin:
    // wheel, touch, a press that could start a scrollbar drag, scroll keys.
    const onUserScroll = (): void => {
      if (!state.pinned) return;
      dispatch({ type: 'user-scroll' });
      update();
    };
    const onKeydown = (event: KeyboardEvent): void => {
      if (isScrollKey(event.key)) onUserScroll();
    };

    root.addEventListener('click', onClick);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('wheel', onUserScroll, { passive: true });
    window.addEventListener('touchmove', onUserScroll, { passive: true });
    window.addEventListener('mousedown', onUserScroll);
    window.addEventListener('keydown', onKeydown);

    const observer = new IntersectionObserver(update, { rootMargin: BAND_ROOT_MARGIN });
    for (const { heading } of pairs) observer.observe(heading);
    update();
    // A page opened at a section's URL starts pinned to it.
    navigated(window.location.hash);

    const container = root;
    return () => {
      observer.disconnect();
      container.removeEventListener('click', onClick);
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('wheel', onUserScroll);
      window.removeEventListener('touchmove', onUserScroll);
      window.removeEventListener('mousedown', onUserScroll);
      window.removeEventListener('keydown', onKeydown);
    };
  });
</script>

<div class="toc-spy" bind:this={root}>{@render children?.()}</div>

<style>
  .toc-spy {
    display: contents;
  }
</style>
