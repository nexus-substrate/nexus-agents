<script lang="ts">
  // Header search over the Pagefind index (#7199). The index is written to
  // dist/pagefind/ by astro-pagefind at build time and loaded on first use, so
  // pages that are never searched never fetch it. In `astro dev` there is no
  // index until a build has run; the status line says so instead of failing
  // silently.
  //
  // Below 40rem (#7285) the field collapses to an icon button so the header
  // fits one row; the button reveals the same form over the header row and
  // focuses it. Escape or leaving the form collapses it again and returns
  // focus to the button. From 40rem the button is not rendered visible and
  // the field is always shown.
  import { tick } from 'svelte';

  interface PagefindResultData {
    url: string;
    excerpt: string;
    meta: { title?: string };
  }
  interface PagefindResult {
    id: string;
    data: () => Promise<PagefindResultData>;
  }
  interface PagefindApi {
    init: () => Promise<void>;
    debouncedSearch: (
      query: string,
      options?: Record<string, unknown>,
      debounceMs?: number,
    ) => Promise<{ results: PagefindResult[] } | null>;
  }

  interface Props {
    /** Site base path without a trailing slash, e.g. `/nexus-agents`. */
    base: string;
  }

  const { base }: Props = $props();

  const MAX_RESULTS = 8;
  const inputId = 'docs-search-input';
  const resultsId = 'docs-search-results';
  const formId = 'docs-search-form';

  let query = $state('');
  let results = $state<PagefindResultData[]>([]);
  let status = $state('');
  let open = $state(false);
  // Narrow screens only: whether the icon button has revealed the form.
  let expanded = $state(false);
  let toggle: HTMLButtonElement | undefined;
  // Search needs the Pagefind script, so the form is rendered hidden and only
  // revealed once this component is running: with JS off there is no input
  // that silently does nothing.
  let mounted = $state(false);
  let form: HTMLFormElement | undefined;
  let input: HTMLInputElement | undefined;
  let pagefind: Promise<PagefindApi> | undefined;

  $effect(() => {
    mounted = true;
  });

  function loadPagefind(): Promise<PagefindApi> {
    pagefind ??= import(/* @vite-ignore */ `${base}/pagefind/pagefind.js`).then(
      async (mod: PagefindApi) => {
        await mod.init();
        return mod;
      },
    );
    return pagefind;
  }

  async function runSearch(term: string): Promise<void> {
    const trimmed = term.trim();
    if (trimmed === '') {
      results = [];
      status = '';
      return;
    }
    if (results.length === 0) status = 'Searching…';
    let api: PagefindApi;
    try {
      api = await loadPagefind();
    } catch {
      pagefind = undefined;
      results = [];
      status = 'Search is unavailable: the search index could not be loaded.';
      return;
    }
    const search = await api.debouncedSearch(trimmed);
    // null: a newer keystroke superseded this search.
    if (search === null) return;
    const top = await Promise.all(search.results.slice(0, MAX_RESULTS).map((r) => r.data()));
    if (term !== query) return;
    results = top;
    const total = search.results.length;
    status =
      total === 0
        ? `No results for “${trimmed}”.`
        : total > MAX_RESULTS
          ? `Showing ${MAX_RESULTS} of ${total} results.`
          : `${total} result${total === 1 ? '' : 's'}.`;
  }

  function onInput(event: Event): void {
    query = (event.currentTarget as HTMLInputElement).value;
    open = query.trim() !== '';
    void runSearch(query);
  }

  // Escape from anywhere in the form (input or a result link) closes the
  // panel and returns focus to the input.
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    if (open) {
      event.preventDefault();
      open = false;
      input?.focus();
    } else if (expanded) {
      event.preventDefault();
      collapse(true);
    }
  }

  async function expand(): Promise<void> {
    expanded = true;
    await tick();
    input?.focus();
  }

  function collapse(returnFocus: boolean): void {
    expanded = false;
    if (returnFocus) toggle?.focus();
  }

  // Close when focus leaves the form entirely (Tab past the last result,
  // click elsewhere). relatedTarget is null when focus goes to the page body.
  function onFocusout(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !form?.contains(next)) {
      open = false;
      if (next !== toggle) collapse(false);
    }
  }
</script>

<div class="docs-search-wrap" class:is-expanded={expanded} hidden={!mounted}>
<button
  bind:this={toggle}
  type="button"
  class="docs-control docs-icon-button docs-search-toggle"
  aria-label="Search the docs"
  title="Search the docs"
  aria-expanded={expanded}
  aria-controls={formId}
  onclick={() => (expanded ? collapse(true) : void expand())}
>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
</button>
<form
  id={formId}
  role="search"
  class="docs-search"
  bind:this={form}
  onsubmit={(e) => e.preventDefault()}
  onkeydown={onKeydown}
  onfocusout={onFocusout}
>
  <label for={inputId} class="visually-hidden">Search the docs</label>
  <input
    bind:this={input}
    id={inputId}
    class="docs-control docs-search-input"
    type="search"
    placeholder="Search docs"
    autocomplete="off"
    aria-controls={resultsId}
    value={query}
    oninput={onInput}
  />
  <!-- Outside the panel, so it exists (and is announced) from the first
       keystroke rather than appearing together with its first message. -->
  <p class="visually-hidden" role="status">{status}</p>
  <div class="docs-search-panel" id={resultsId} hidden={!open}>
    <p class="docs-search-status" aria-hidden="true">{status}</p>
    {#if results.length > 0}
      <ul>
        {#each results as result (result.url)}
          <li>
            <a href={result.url}>{result.meta.title ?? result.url}</a>
            <!-- Pagefind excerpts are HTML-escaped page text with <mark> around matches. -->
            <p class="docs-search-excerpt">{@html result.excerpt}</p>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</form>
</div>

<style>
  .docs-search-wrap[hidden] {
    display: none;
  }
  .docs-search {
    position: relative;
  }
  .docs-search-toggle {
    display: none;
  }
  .docs-search-input {
    width: min(16rem, 100%);
  }
  @media (max-width: 74.99rem) {
    .docs-search-input {
      width: 12rem;
    }
  }
  /* Below 40rem: icon button; the form opens over the header row. */
  @media (max-width: 39.99rem) {
    .docs-search-toggle {
      display: inline-flex;
    }
    .docs-search {
      display: none;
    }
    .is-expanded .docs-search {
      display: block;
      position: absolute;
      inset-inline: var(--gutter);
      /* The header row's top padding (docs.css .docs-masthead-inner). */
      top: var(--space-2);
      z-index: var(--z-dropdown);
    }
    .is-expanded .docs-search-input {
      width: 100%;
      min-height: var(--touch-target);
      background: var(--color-bg);
    }
    .is-expanded .docs-search-panel {
      inset-inline: 0;
      width: auto;
    }
  }
  .docs-search-panel {
    position: absolute;
    inset-inline-end: 0;
    top: calc(100% + var(--space-2));
    z-index: var(--z-dropdown);
    width: min(28rem, calc(100vw - 2 * var(--space-5)));
    max-height: 70vh;
    overflow-y: auto;
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg);
    border: var(--border-width) var(--border-style) var(--color-border-bold);
    border-radius: var(--radius-md);
  }
  .docs-search-panel[hidden] {
    display: none;
  }
  .docs-search-status {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    color: var(--color-fg-muted);
  }
  ul {
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
  }
  li + li {
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: var(--border-width) var(--border-style) var(--color-border);
  }
  .docs-search-excerpt {
    margin: var(--space-1) 0 0;
    font-size: var(--text-meta);
    line-height: var(--leading-meta);
    color: var(--color-fg-muted);
  }
  .docs-search-excerpt :global(mark) {
    background: var(--color-selection-bg);
    color: var(--color-selection-fg);
  }
</style>
