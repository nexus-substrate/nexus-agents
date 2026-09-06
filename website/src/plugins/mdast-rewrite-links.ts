/**
 * mdast-rewrite-links.ts
 *
 * Rewrites markdown link URLs so that repo-relative paths resolve correctly
 * on the deployed website. Applied during the Astro build as a Sätteri mdast
 * plugin (`markdown.processor`).
 *
 * Rules (evaluated in order):
 *   1. External URLs (http/https) — unchanged
 *   2. Anchor-only (#...) — unchanged
 *   3. .md links inside docs/ tree — rewrite to /nexus-agents/docs/<slug>/[#anchor]
 *   4. Links that escape docs/ into src/, packages/, or root files — GitHub blob URL
 *   5. Everything else — unchanged (best-effort passthrough)
 *
 * Ported from a remark/unified plugin in #4359 (Astro 6 -> 7). Astro 7 replaced
 * the unified pipeline with Sätteri as the default Markdown processor, so the
 * legacy `markdown.remarkPlugins` option no longer runs without pulling
 * `@astrojs/markdown-remark` back in. The rewriting rules below are unchanged by
 * the port — only the traversal mechanism differs: instead of walking the tree
 * ourselves and reading `vfile.history[0]`, Sätteri dispatches a `link` visitor
 * and exposes the source document as `ctx.fileURL`.
 *
 * @module website/src/plugins/mdast-rewrite-links
 */

import { join, normalize, dirname, extname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineMdastPlugin, type MdastPluginDefinition } from 'satteri';

const DOCS_PREFIX = '/nexus-agents/docs';
/**
 * The generated TypeDoc reference lives at `docs/api/**` in the repo but is
 * EXCLUDED from the `docs` collection and served by its own collection at
 * `/api/` (see website/src/content.config.ts). Rewriting those links through
 * `DOCS_PREFIX` produced a 404 on every one: the published site carried 1,156
 * inbound links to `/nexus-agents/docs/api/core/` — roughly every page —
 * against a directory the build never emits (#5750).
 */
const API_PREFIX = '/nexus-agents/api';
const GITHUB_BLOB = 'https://github.com/nexus-substrate/nexus-agents/blob/main';

/** Convert a filename segment (no extension) into a lowercase slug segment. */
function fileToSlug(name: string): string {
  return name
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/[.\-\s]+/g, '_');
}

/**
 * Returns true if the target file has YAML frontmatter with a `title:` field,
 * meaning Astro will publish it as a docs page. Returns false on any error.
 */
function hasPublishedFrontmatter(docsRoot: string, resolved: string): boolean {
  try {
    const absPath = resolve(docsRoot, resolved);
    // Guard against path traversal outside docsRoot.
    if (!absPath.startsWith(resolve(docsRoot))) {
      return false;
    }
    const content = readFileSync(absPath, 'utf8');
    // Check for YAML frontmatter block starting at file top.
    if (!content.startsWith('---')) {
      return false;
    }
    const closeIdx = content.indexOf('\n---', 3);
    if (closeIdx === -1) {
      return false;
    }
    const frontmatter = content.slice(0, closeIdx);
    return /^title\s*:/m.test(frontmatter);
  } catch {
    return false;
  }
}

/** Rewrite a resolved path that stays inside docs/ to a website or GitHub URL. */
function rewriteIntraDocsLink(docsRoot: string, resolved: string, anchor: string): string | null {
  const ext = extname(resolved).toLowerCase();
  if (ext !== '.md' && ext !== '') {
    return null;
  }
  if (!hasPublishedFrontmatter(docsRoot, resolved)) {
    return `${GITHUB_BLOB}/docs/${resolved}${anchor}`;
  }
  // The api collection's route uses the file name as-is, so the docs slug rule
  // (lowercase, `-` and `.` to `_`) must not apply — `cli-adapters.md` is served
  // at /api/cli-adapters/, not /api/cli_adapters/ (#5750).
  const apiName = /^api\/([^/]+)\.md$/i.exec(resolved)?.[1];
  if (apiName !== undefined) {
    return `${API_PREFIX}/${apiName}/${anchor}`;
  }
  const parts = resolved.split('/');
  const slugParts = parts.map((p, i) => (i === parts.length - 1 ? fileToSlug(p) : p.toLowerCase()));
  return `${DOCS_PREFIX}/${slugParts.join('/')}/${anchor}`;
}

/**
 * Given the docs-relative path of the source file being processed
 * (e.g. "architecture/README.md") and a raw link href, return the
 * rewritten href or null to leave the link unchanged.
 *
 * Exported for tests: this is the whole behavioural surface of the plugin, and
 * keeping it independently callable is what let the Astro 6 -> 7 port be
 * verified against an unchanged test suite (#4359).
 */
export function rewriteHref(
  docsRoot: string,
  currentFilePath: string,
  href: string
): string | null {
  if (/^https?:\/\//i.test(href)) return null;
  if (href.startsWith('#')) return null;
  if (/^(javascript|data|vbscript):/i.test(href)) return '';

  const hashIndex = href.indexOf('#');
  const rawPath = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const anchor = hashIndex === -1 ? '' : href.slice(hashIndex);

  const currentDir = dirname(currentFilePath);
  const resolved = normalize(join(currentDir, rawPath));

  if (!resolved.startsWith('..')) {
    return rewriteIntraDocsLink(docsRoot, resolved, anchor);
  }

  const repoRelative = resolved.replace(/^\.\.\//, '');
  if (extname(repoRelative)) {
    return `${GITHUB_BLOB}/${repoRelative}${anchor}`;
  }

  return null;
}

/** The docs-tree location of the document currently being processed. */
export interface DocsContext {
  /** Absolute path of the docs root, including the trailing separator. */
  readonly docsRoot: string;
  /** Path of the current file relative to `docsRoot`, e.g. "architecture/README.md". */
  readonly currentFilePath: string;
}

/**
 * Split the absolute path of the source document into its docs root and its
 * docs-relative path. Returns null when the file does not live under a `docs/`
 * tree, in which case there is no meaningful relative base and links are left
 * alone.
 *
 * Exported for tests.
 */
export function deriveDocsContext(absPath: string): DocsContext | null {
  const docsMarker = '/docs/';
  const docsIdx = absPath.lastIndexOf(docsMarker);
  if (docsIdx === -1) return null;

  const currentFilePath = absPath.slice(docsIdx + docsMarker.length);
  const docsRoot = absPath.slice(0, docsIdx + docsMarker.length);
  if (currentFilePath === '' || docsRoot === '') return null;

  return { docsRoot, currentFilePath };
}

/**
 * Sätteri mdast plugin that rewrites link nodes.
 *
 * Sätteri dispatches one call per `link` node and exposes the source document
 * as `ctx.fileURL` (the compile's `fileURL` option, which Astro populates), so
 * the docs-relative base is derived per node rather than once per document as
 * it was under remark. Resolution is pure string work; the only I/O is the
 * frontmatter probe, which the remark version performed per link as well.
 */
export default function mdastRewriteLinks(): MdastPluginDefinition {
  return defineMdastPlugin({
    name: 'nexus-rewrite-links',
    link(node, ctx) {
      if (ctx.fileURL === undefined) return;

      const docs = deriveDocsContext(fileURLToPath(ctx.fileURL));
      if (docs === null) return;

      const rewritten = rewriteHref(docs.docsRoot, docs.currentFilePath, node.url);
      if (rewritten !== null) {
        ctx.setProperty(node, 'url', rewritten);
      }
    },
  });
}
