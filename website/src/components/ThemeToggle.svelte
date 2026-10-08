<script lang="ts">
  // Light/dark toggle (#7199), a Svelte island since #7313. Adapted from
  // oklch-terminal-themes' site/src/components/ThemeToggle.astro (MIT,
  // William Zujkowski). ThemeInit.astro restores the stored choice before
  // paint; this button reflects and changes it. The decisions are in
  // lib/theme.ts.
  //
  // aria-pressed reports whether the EFFECTIVE theme is dark, so it is right
  // whether the theme came from a stored choice or from the OS. Until the
  // reader chooses, OS preference changes keep being followed.
  //
  // Server-rendered `hidden` and revealed once the island runs, so with JS
  // off there is no dead button reporting a state it cannot change.
  //
  // Icon-only (#7285): a 48px square whose icon shows the current theme (moon
  // in dark, sun in light), named "Dark theme" with aria-pressed as the
  // state — the name never changes, so it cannot contradict the state. The
  // title gives sighted pointer users the same name.
  //
  // No "follow the OS again" state: a third state does not fit aria-pressed
  // (a two-state control), and a separate reset control was not judged worth
  // its header space. Clearing site data restores OS-following.
  import { onMount } from 'svelte';
  import { THEME_STORAGE_KEY, effectiveDark, toggledTheme } from '../lib/theme.ts';

  /** Other listeners (Mermaid in PageScripts.astro) re-theme on this event. */
  const THEME_CHANGE_EVENT = 'nexus:themechange';

  let mounted = $state(false);
  let dark = $state(false);

  // Set when the reader chooses on this page. Kept even if storage throws,
  // so an OS preference change cannot silently undo an in-page choice.
  let chosenThisPage = false;

  function osDark(): MediaQueryList {
    return window.matchMedia('(prefers-color-scheme: dark)');
  }

  function sync(): void {
    dark = effectiveDark(document.documentElement.dataset.theme, osDark().matches);
  }

  function hasChoice(): boolean {
    if (chosenThisPage) return true;
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }

  function choose(): void {
    const root = document.documentElement;
    const next = toggledTheme(root.dataset.theme, osDark().matches);
    root.dataset.theme = next;
    chosenThisPage = true;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the choice lasts for this page only.
    }
    document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT));
  }

  function onOsChange(): void {
    if (hasChoice()) return;
    delete document.documentElement.dataset.theme;
    document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT));
  }

  onMount(() => {
    // Every change, from this button, another toggle or the OS, ends in the
    // event, so each toggle on the page re-reads the state from it.
    const query = osDark();
    query.addEventListener('change', onOsChange);
    document.addEventListener(THEME_CHANGE_EVENT, sync);
    sync();
    mounted = true;
    return () => {
      query.removeEventListener('change', onOsChange);
      document.removeEventListener(THEME_CHANGE_EVENT, sync);
    };
  });
</script>

<button
  type="button"
  class="docs-control docs-icon-button theme-toggle"
  data-theme-toggle
  aria-pressed={dark}
  aria-label="Dark theme"
  title="Dark theme"
  hidden={!mounted}
  onclick={choose}
>
  <svg class="theme-icon-dark" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>
  <svg class="theme-icon-light" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>
</button>

<style>
  .theme-toggle {
    cursor: pointer;
    transition: border-color var(--motion-fast) var(--motion-easing);
  }
  .theme-toggle[hidden] {
    display: none;
  }
  .theme-toggle:hover {
    border-color: var(--color-fg-muted);
  }
  .theme-toggle[aria-pressed='true'] .theme-icon-light,
  .theme-toggle[aria-pressed='false'] .theme-icon-dark {
    display: none;
  }
</style>
