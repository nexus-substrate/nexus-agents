<script lang="ts">
  // Narrow-screen navigation drawer (#7308), a Svelte island since #7313:
  // the "Menu" button and a native <dialog> opened with showModal(). The
  // browser makes the rest of the page inert and closes it on Escape; Tab
  // containment is decided by lib/menu-drawer.ts.
  //
  // One copy of each nav, by moving rather than slotting. The drawer shows
  // two server-rendered navs that live in two different places: the Primary
  // nav in the header row and, on docs pages, the side nav in the page grid
  // (DocsLayout's .docs-rail). Both must render in place from 64rem and
  // without JS. A slot can only put its markup in ONE place — inside this
  // island — so slotting either nav would take it out of the layout it
  // needs at desktop width. Instead the drawer has no nav markup of its
  // own: on open it MOVES those two elements into its body and on close
  // moves them back to where they were.
  //
  // Without JS the button and the drawer stay hidden (docs.css keys the
  // narrow layout on [data-menu-drawer], set by ThemeInit's pre-paint
  // script), the Primary nav wraps under the row and the side nav keeps its
  // "Section navigation" disclosure.
  import { onMount } from 'svelte';
  import { FOCUSABLE_SELECTOR, wrapFocusTarget } from '../lib/menu-drawer.ts';

  const DIALOG_ID = 'site-menu';
  const TITLE_ID = 'site-menu-title';
  // The drawer is for narrow screens only; tokens.css --bp-desktop.
  const DESKTOP_QUERY = '(min-width: 64rem)';

  let expanded = $state(false);
  let dialog: HTMLDialogElement | undefined;
  let opener: HTMLButtonElement | undefined;
  let closer: HTMLButtonElement | undefined;
  let body: HTMLElement | undefined;

  interface Placement {
    node: Element;
    parent: Node;
    next: Node | null;
  }
  let placements: Placement[] = [];

  // The side nav's outer disclosure: forced open inside the drawer, and put
  // back to its width-driven state (DocsLayout's pre-paint script) after.
  function sideNavDisclosure(): HTMLDetailsElement | null {
    return document.querySelector<HTMLDetailsElement>('.docs-rail > details[data-collapse-below]');
  }

  function moveIn(target: HTMLElement): void {
    const parts = [
      document.querySelector('[data-menu-part]'),
      document.querySelector('.docs-rail'),
    ].filter((node): node is Element => node !== null && node.parentNode !== null);
    placements = parts.map((node) => ({ node, parent: node.parentNode as Node, next: node.nextSibling }));
    for (const { node } of placements) target.append(node);
    const disclosure = sideNavDisclosure();
    if (disclosure) disclosure.open = true;
  }

  function moveBack(): void {
    for (const { node, parent, next } of placements.reverse()) parent.insertBefore(node, next);
    placements = [];
    const disclosure = sideNavDisclosure();
    if (disclosure) disclosure.open = window.matchMedia(DESKTOP_QUERY).matches;
  }

  function focusables(root: HTMLElement): HTMLElement[] {
    // Skip controls that are not rendered, including those inside a closed
    // disclosure: Chromium hides that content with content-visibility, so
    // the links still report boxes and only checkVisibility() excludes them.
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((el) => el.checkVisibility());
  }

  function open(): void {
    if (!dialog || !body || !closer || dialog.open) return;
    moveIn(body);
    dialog.showModal();
    expanded = true;
    closer.focus();
    // Bring the current page's link into view inside the drawer (an instant
    // scroll of the drawer only; the page behind is locked).
    body.querySelector('.docs-rail a[aria-current]')?.scrollIntoView({ block: 'center' });
  }

  // Escape fires `cancel` and then `close`; every way of closing ends here.
  function onClose(): void {
    moveBack();
    expanded = false;
    opener?.focus();
  }

  // A click on the dialog box itself is a click on the backdrop: the panel
  // fills the box, so every click inside the drawer lands on a descendant.
  function onDialogClick(event: MouseEvent): void {
    if (event.target === dialog) dialog.close();
  }

  // showModal() makes the page inert but lets Tab leave for the browser
  // chrome after the last control; wrap it instead.
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !dialog) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = wrapFocusTarget(focusables(dialog), active, event.shiftKey);
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  onMount(() => {
    // Widening past 64rem while open: the navs belong back in the page.
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onWiden = (): void => {
      if (desktop.matches && dialog?.open) dialog.close();
    };
    desktop.addEventListener('change', onWiden);
    return () => desktop.removeEventListener('change', onWiden);
  });
</script>

<button
  bind:this={opener}
  type="button"
  class="docs-control docs-menu-button"
  aria-expanded={expanded}
  aria-controls={DIALOG_ID}
  data-menu-open
  onclick={open}
>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>
  <span>Menu</span>
</button>
<dialog
  bind:this={dialog}
  id={DIALOG_ID}
  class="docs-menu"
  aria-labelledby={TITLE_ID}
  data-pagefind-ignore
  onclose={onClose}
  onclick={onDialogClick}
  onkeydown={onKeydown}
>
  <div class="docs-menu-panel">
    <div class="docs-menu-head">
      <p id={TITLE_ID} class="docs-menu-title">Menu</p>
      <!-- No autofocus: open() focuses Close itself, and Svelte's autofocus
           would also run on hydration. -->
      <button bind:this={closer} type="button" class="docs-control docs-menu-close" data-menu-close onclick={() => dialog?.close()}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"></path></svg>
        <span>Close</span>
      </button>
    </div>
    <div class="docs-menu-body" bind:this={body} data-menu-slot></div>
  </div>
</dialog>
