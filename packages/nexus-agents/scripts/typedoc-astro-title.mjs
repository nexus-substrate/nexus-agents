// @ts-check
/**
 * Local TypeDoc plugin: inject Astro-compatible titles (#3686) and keep
 * cross-page links aligned with emitted HTML anchors (#7201).
 *
 * The Astro `docs` content collection (website/src/pages/docs/[...slug].astro)
 * only renders entries whose frontmatter has a `title`. typedoc-plugin-frontmatter
 * emits frontmatter but no per-page title, so we add one here from the page model.
 *
 * Runs alongside typedoc-plugin-markdown + typedoc-plugin-frontmatter (load order
 * matters: this listens on MarkdownPageEvent.BEGIN and writes page.frontmatter,
 * which the frontmatter plugin then serializes).
 */
import { MarkdownPageEvent, MarkdownRendererEvent } from 'typedoc-plugin-markdown';

/**
 * @param {import('typedoc-plugin-markdown').MarkdownApplication} app
 */
export function load(app) {
  app.renderer.on(MarkdownRendererEvent.BEGIN, () => {
    const router = app.renderer.router;
    const getFullUrl = router.getFullUrl.bind(router);
    // The markdown router caches unprefixed full URLs, while getAnchor applies
    // anchorPrefix. Cross-page links must use the same IDs as emitted anchors.
    router.getFullUrl = (target) => {
      const url = getFullUrl(target);
      const fragment = url.indexOf('#');
      return fragment === -1 ? url : `${url.slice(0, fragment)}#${router.getAnchor(target)}`;
    };
  });
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
