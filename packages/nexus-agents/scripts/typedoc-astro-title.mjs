// @ts-check
/**
 * Local TypeDoc plugin (spike #3686): inject an Astro-compatible `title` into the
 * frontmatter of every generated Markdown page.
 *
 * The Astro `docs` content collection (website/src/pages/docs/[...slug].astro)
 * only renders entries whose frontmatter has a `title`. typedoc-plugin-frontmatter
 * emits frontmatter but no per-page title, so we add one here from the page model.
 *
 * Runs alongside typedoc-plugin-markdown + typedoc-plugin-frontmatter (load order
 * matters: this listens on MarkdownPageEvent.BEGIN and writes page.frontmatter,
 * which the frontmatter plugin then serializes).
 */
import { MarkdownPageEvent } from 'typedoc-plugin-markdown';

/**
 * @param {import('typedoc-plugin-markdown').MarkdownApplication} app
 */
export function load(app) {
  app.renderer.on(MarkdownPageEvent.BEGIN, (page) => {
    const name = page.model?.name ?? page.url ?? 'API Reference';
    const title = name === 'index' || !name ? 'nexus-agents API' : `API: ${name}`;
    page.frontmatter = {
      title,
      description: `Generated API reference for ${name}.`,
      ...page.frontmatter,
    };
  });
}
