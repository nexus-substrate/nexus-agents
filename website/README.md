# nexus-agents website

The documentation site published at
<https://nexus-substrate.github.io/nexus-agents/>. Astro, with Svelte for the
interactive parts. It is its own pnpm root.

## Commands

Run from `website/` with Node 24.

| Command           | What it does                                                                      |
| ----------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`        | Local dev server. Search shows "unavailable" until a build has written the index. |
| `pnpm build`      | Static build into `dist/`, plus the Pagefind search index.                        |
| `pnpm check`      | `astro check` (types and diagnostics for `.astro` files).                         |
| `pnpm test`       | Vitest unit tests in `src/**/*.test.ts`, then the a11y-check self-tests.          |
| `pnpm a11y`       | axe over every sitemap URL and the 404 page, in both themes, against `dist/`.     |
| `pnpm menu-check` | Playwright behaviour check of the narrow-screen Menu drawer against `dist/`.      |

The docs pages are read from `../docs`, and the API pages need the generated
TypeDoc Markdown (`pnpm --filter nexus-agents run docs:api:md` at the repo
root). If a build serves stale content, delete
`node_modules/.astro/data-store.json`.

## Interactive widgets are Svelte islands

Every interactive widget is a Svelte component in `src/components/`,
hydrated with `client:load` (#7313):

| Island               | Behaviour                                                        |
| -------------------- | ---------------------------------------------------------------- |
| `SearchBox.svelte`   | Header search over the Pagefind index.                           |
| `ThemeToggle.svelte` | Light/dark toggle (`aria-pressed`, follows the OS until chosen). |
| `MenuDrawer.svelte`  | "Menu" button and the `<dialog>` navigation drawer below 64rem.  |
| `TocSpy.svelte`      | Marks the "On this page" link of the section being read.         |

Rules for a new widget:

- **Server-render the content; the island adds behaviour.** When a widget
  enhances markup the server already renders, pass that markup into the
  island as its default slot (`<TocSpy client:load><nav>…</nav></TocSpy>`).
  Astro renders the slot into the island's HTML and Svelte adopts those nodes
  on hydration, so there is one copy in the DOM and the page works without
  JavaScript. Keep the snippet rendered unconditionally: a raw snippet that
  re-renders is rebuilt from the original HTML and loses any changes made to
  it since.
- **Render the control hidden until it works.** A control that does nothing
  without JS is server-rendered `hidden` and revealed on mount, as
  `SearchBox` and `ThemeToggle` do.
- **Pure logic lives in `src/lib/`** with a Vitest unit test
  (`menu-drawer.ts`, `toc-spy.ts`, `theme.ts`); the component is the DOM
  binding and calls it.
- **Moving is the exception to slotting.** `MenuDrawer` shows two navs that
  live in different places in the page (the header row and the docs side
  column) and must render there from 64rem and without JS. A slot can only
  place markup inside the island, so the drawer instead moves those two
  elements into the open dialog and back on close. Still one copy.

## Inline scripts are for pre-paint work only

An inline script runs while the page is parsed, before any island hydrates.
Use one only when something must be right before first paint:

- `ThemeInit.astro` (in `<head>`): restores the stored theme and marks the
  page as having JS (`[data-menu-drawer]`), so neither the wrong theme nor
  the no-JS header layout flashes.
- `DocsLayout.astro`: two scripts placed right after the side nav and the
  "On this page" nav set each disclosure's open state for the viewport width,
  so a phone's first screen is the page, not an open nav.

Not yet converted, and so outside this rule today: the copy buttons on code
blocks (an inline script in `PageScripts.astro`), and Mermaid rendering and
table scroll regions (bundled module scripts in `PageScripts.astro` and
`DocsLayout.astro`).
