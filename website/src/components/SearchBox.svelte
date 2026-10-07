<script lang="ts">
  // Header search over the Pagefind index (#7199). The index is written to
  // dist/pagefind/ by astro-pagefind at build time and loaded on first use, so
  // pages that are never searched never fetch it. In `astro dev` there is no
  // index until a build has run; the status line says so instead of failing
  // silently.

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

  let query = $state('');
  let results = $state<PagefindResultData[]>([]);
  let status = $state('');
  let pagefind: Promise<PagefindApi> | undefined;

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
    void runSearch(query);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      query = '';
      results = [];
      status = '';
    }
  }
</script>

<form role="search" class="docs-search" onsubmit={(e) => e.preventDefault()}>
  <label for={inputId} class="visually-hidden">Search the docs</label>
  <input
    id={inputId}
    class="docs-control docs-search-input"
    type="search"
    placeholder="Search docs"
    autocomplete="off"
    aria-controls={resultsId}
    value={query}
    oninput={onInput}
    onkeydown={onKeydown}
  />
  <div class="docs-search-panel" id={resultsId} hidden={query.trim() === ''}>
    <p class="docs-search-status" role="status">{status}</p>
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

<style>
  .docs-search {
    position: relative;
  }
  .docs-search-input {
    width: min(16rem, 100%);
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
