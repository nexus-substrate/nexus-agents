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

import { join, normalize, dirname, extname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const DOCS_PREFIX = '/nexus-agents/docs';
const GITHUB_BLOB = 'https://github.com/nexus-substrate/nexus-agents/blob/main';

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
  const parts = resolved.split('/');
  const slugParts = parts.map((p, i) => (i === parts.length - 1 ? fileToSlug(p) : p.toLowerCase()));
  return `${DOCS_PREFIX}/${slugParts.join('/')}/${anchor}`;
}

/**
 * Given the docs-relative path of the source file being processed
 * (e.g. "architecture/README.md") and a raw link href, return the
 * rewritten href or null to leave the link unchanged.
 */
function rewriteHref(docsRoot: string, currentFilePath: string, href: string): string | null {
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
    const docsRoot = docsIdx !== -1 ? absPath.slice(0, docsIdx + docsMarker.length) : '';

    if (currentFilePath === '' || docsRoot === '') {
      return;
    }

    walk(tree, (node) => {
      if (!isLink(node)) {
        return;
      }
      const rewritten = rewriteHref(docsRoot, currentFilePath, node.url);
      if (rewritten !== null) {
        node.url = rewritten;
      }
    });
  };
}
