/**
 * remark-rewrite-links.ts
 *
 * Rewrites markdown link URLs so that repo-relative paths resolve correctly
 * on the deployed website. Applied during the Astro build via remarkPlugins.
 *
 * Rules (evaluated in order):
 *   1. External URLs (http/https) — unchanged
 *   2. Anchor-only (#...) — unchanged
 *   3. .md links inside docs/ tree — rewrite to /nexus-agents/docs/<slug>/[#anchor]
 *   4. Links that escape docs/ into src/, packages/, or root files — GitHub blob URL
 *   5. Everything else — unchanged (best-effort passthrough)
 */

import { join, normalize, dirname, extname } from 'node:path';

const DOCS_PREFIX = '/nexus-agents/docs';
const GITHUB_BLOB = 'https://github.com/williamzujkowski/nexus-agents/blob/main';

/** Minimal AST node shape for remark mdast. */
interface AstNode {
  type: string;
  url?: string;
  children?: AstNode[];
}

/** A link node in the mdast tree. */
interface LinkNode extends AstNode {
  type: 'link';
  url: string;
}

/** VFile shape with history array. */
interface VFileWithHistory {
  history: string[];
}

/** Type guard for link nodes. */
function isLink(node: AstNode): node is LinkNode {
  return node.type === 'link' && typeof node.url === 'string';
}

/** Walk the AST and call visitor on every node. */
function walk(node: AstNode, visitor: (n: AstNode) => void): void {
  visitor(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      walk(child, visitor);
    }
  }
}

/** Convert a filename segment (no extension) into a lowercase slug segment. */
function fileToSlug(name: string): string {
  return name
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/[.\-\s]+/g, '_');
}

/**
 * Given the docs-relative path of the source file being processed
 * (e.g. "architecture/README.md") and a raw link href, return the
 * rewritten href or null to leave the link unchanged.
 */
function rewriteHref(currentFilePath: string, href: string): string | null {
  // 1. External URLs.
  if (/^https?:\/\//i.test(href)) {
    return null;
  }

  // 2. Anchor-only links.
  if (href.startsWith('#')) {
    return null;
  }

  // Split off trailing anchor fragment.
  const hashIndex = href.indexOf('#');
  const rawPath = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const anchor = hashIndex === -1 ? '' : href.slice(hashIndex); // includes '#'

  // Resolve relative to current file's directory inside docs/.
  const currentDir = dirname(currentFilePath);
  const resolved = normalize(join(currentDir, rawPath));

  // 3. Path stays inside docs/ (normalize() leaves no leading "..").
  if (!resolved.startsWith('..')) {
    const ext = extname(resolved).toLowerCase();
    if (ext !== '.md' && ext !== '') {
      // Non-markdown file inside docs/ (images, yaml, etc.) — leave unchanged.
      return null;
    }
    // Build slug from resolved path parts.
    const parts = resolved.split('/');
    const slugParts = parts.map((p, i) =>
      i === parts.length - 1 ? fileToSlug(p) : p.toLowerCase()
    );
    const slug = slugParts.join('/');
    return `${DOCS_PREFIX}/${slug}/${anchor}`;
  }

  // 4. Path escapes docs/ — link to GitHub.
  const repoRelative = resolved.replace(/^\.\.\//, '');

  if (extname(repoRelative)) {
    return `${GITHUB_BLOB}/${repoRelative}${anchor}`;
  }

  // No extension outside docs/ — unusual; leave unchanged.
  return null;
}

/**
 * Remark plugin that rewrites link nodes in the mdast.
 *
 * Astro injects VFile metadata so that vfile.history[0] is the absolute path
 * to the source .md file. We use this to derive the docs-relative path needed
 * for accurate relative-link resolution.
 */
export default function remarkRewriteLinks(): (tree: AstNode, vfile: VFileWithHistory) => void {
  return (tree: AstNode, vfile: VFileWithHistory) => {
    const absPath: string = typeof vfile.history[0] === 'string' ? vfile.history[0] : '';

    const docsMarker = '/docs/';
    const docsIdx = absPath.lastIndexOf(docsMarker);
    const currentFilePath = docsIdx !== -1 ? absPath.slice(docsIdx + docsMarker.length) : '';

    if (currentFilePath === '') {
      return;
    }

    walk(tree, (node) => {
      if (!isLink(node)) {
        return;
      }
      const rewritten = rewriteHref(currentFilePath, node.url);
      if (rewritten !== null) {
        node.url = rewritten;
      }
    });
  };
}
