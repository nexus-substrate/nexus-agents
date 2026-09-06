/**
 * Tests for the website's link-rewriting markdown plugin.
 *
 * The plugin had no coverage before the Astro 7 migration (#4359), which was a
 * problem: it is the only thing making repo-relative `docs/**` links resolve on
 * the deployed site, and the migration moves it onto a different markdown
 * processor. These tests pin the documented behaviour so the port is verifiable
 * rather than hopeful.
 *
 * The plugin reads the linked file off disk to decide whether it is a published
 * page, so the fixtures are real files in a temp `docs/` tree.
 *
 * @module website/src/plugins/remark-rewrite-links.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mdastRewriteLinks, { rewriteHref, deriveDocsContext } from './mdast-rewrite-links.js';

const DOCS_PREFIX = '/nexus-agents/docs';
const GITHUB_BLOB = 'https://github.com/nexus-substrate/nexus-agents/blob/main';

let root: string;
let docsRoot: string;

/**
 * Resolve a single href the way the plugin would for a document at
 * `sourceRelPath`. Targets the pure rewriting surface, which the Astro 6 -> 7
 * port left unchanged — these assertions passed identically against the old
 * remark implementation.
 */
function rewrite(href: string, sourceRelPath = 'architecture/README.md'): string {
  const abs = join(docsRoot, sourceRelPath);
  const docs = deriveDocsContext(abs);
  if (docs === null) throw new Error(`no docs context for ${abs}`);
  return rewriteHref(docs.docsRoot, docs.currentFilePath, href) ?? href;
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'remark-rewrite-links-'));
  docsRoot = join(root, 'docs');
  mkdirSync(join(docsRoot, 'architecture'), { recursive: true });
  mkdirSync(join(root, 'packages'), { recursive: true });

  // Published page — has YAML frontmatter with a title.
  writeFileSync(
    join(docsRoot, 'architecture', 'ROUTING_SYSTEM.md'),
    '---\ntitle: Routing System\n---\n\n# Routing\n'
  );
  // Same, with a name that exercises slug normalisation.
  writeFileSync(
    join(docsRoot, 'architecture', 'MULTI-REPO ORCHESTRATION.md'),
    '---\ntitle: Multi Repo\n---\n\n# Multi\n'
  );
  // Unpublished — no frontmatter at all, so it is not a site page.
  writeFileSync(join(docsRoot, 'architecture', 'NOTES.md'), '# Just notes\n');
  // Unpublished — frontmatter present but no title field.
  writeFileSync(
    join(docsRoot, 'architecture', 'NO_TITLE.md'),
    '---\ndescription: no title here\n---\n\n# Body\n'
  );
  // The generated TypeDoc reference. It lives under docs/ and carries a title,
  // but it is EXCLUDED from the docs collection and mounted at /api/ instead
  // (website/src/content.config.ts), so /docs/api/... is a 404 (#5750).
  mkdirSync(join(docsRoot, 'api'), { recursive: true });
  writeFileSync(join(docsRoot, 'api', 'core.md'), '---\ntitle: core\n---\n\n# core\n');
  writeFileSync(
    join(docsRoot, 'api', 'cli-adapters.md'),
    '---\ntitle: cli-adapters\n---\n\n# cli\n'
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the generated API reference is mounted at /api/, not /docs/api/ (#5750)', () => {
  /**
   * docs/api is excluded from the `docs` collection and served by its own
   * collection at /api/, so rewriting those links through DOCS_PREFIX produced
   * a 404. The published site carried 1,156 inbound links to
   * /nexus-agents/docs/api/core/ — roughly every page — against a directory
   * that does not exist in the build output.
   */
  it('rewrites an api link to the /api/ route', () => {
    expect(rewrite('../api/core.md')).toBe('/nexus-agents/api/core/');
  });

  it('keeps the anchor', () => {
    expect(rewrite('../api/core.md#result')).toBe('/nexus-agents/api/core/#result');
  });

  it('keeps the filename as the slug — the api route does not underscore it', () => {
    // fileToSlug turns `cli-adapters` into `cli_adapters`, but the built route
    // is /api/cli-adapters/, so the docs slug rule must not apply here.
    expect(rewrite('../api/cli-adapters.md')).toBe('/nexus-agents/api/cli-adapters/');
  });

  it('still sends a non-api docs page through the docs route', () => {
    expect(rewrite('ROUTING_SYSTEM.md')).toBe(`${DOCS_PREFIX}/architecture/routing_system/`);
  });
});

describe('remarkRewriteLinks', () => {
  describe('links it must leave alone', () => {
    it('passes through external http(s) URLs', () => {
      expect(rewrite('https://example.com/a')).toBe('https://example.com/a');
      expect(rewrite('http://example.com/a')).toBe('http://example.com/a');
    });

    it('passes through anchor-only links', () => {
      expect(rewrite('#section-two')).toBe('#section-two');
    });

    it('passes through a non-markdown extension inside docs/', () => {
      // Rule 5 best-effort passthrough: not .md and not extensionless.
      expect(rewrite('./diagram.png')).toBe('./diagram.png');
    });
  });

  describe('intra-docs markdown links', () => {
    it('rewrites a published sibling page to a site URL', () => {
      expect(rewrite('./ROUTING_SYSTEM.md')).toBe(`${DOCS_PREFIX}/architecture/routing_system/`);
    });

    it('preserves the anchor when rewriting', () => {
      expect(rewrite('./ROUTING_SYSTEM.md#stage-routers')).toBe(
        `${DOCS_PREFIX}/architecture/routing_system/#stage-routers`
      );
    });

    it('normalises dots, dashes and spaces in the slug to underscores', () => {
      expect(rewrite('./MULTI-REPO ORCHESTRATION.md')).toBe(
        `${DOCS_PREFIX}/architecture/multi_repo_orchestration/`
      );
    });

    it('sends an unpublished page (no frontmatter) to the GitHub blob URL', () => {
      expect(rewrite('./NOTES.md')).toBe(`${GITHUB_BLOB}/docs/architecture/NOTES.md`);
    });

    it('sends frontmatter-without-title to the GitHub blob URL', () => {
      expect(rewrite('./NO_TITLE.md')).toBe(`${GITHUB_BLOB}/docs/architecture/NO_TITLE.md`);
    });

    it('sends a missing file to the GitHub blob URL rather than a dead site link', () => {
      expect(rewrite('./DOES_NOT_EXIST.md')).toBe(
        `${GITHUB_BLOB}/docs/architecture/DOES_NOT_EXIST.md`
      );
    });
  });

  describe('links that escape the docs tree', () => {
    it('rewrites a link into packages/ to the GitHub blob URL', () => {
      expect(rewrite('../../packages/nexus-agents/src/index.ts')).toBe(
        `${GITHUB_BLOB}/packages/nexus-agents/src/index.ts`
      );
    });

    it('rewrites a root file to the GitHub blob URL', () => {
      expect(rewrite('../../CLAUDE.md')).toBe(`${GITHUB_BLOB}/CLAUDE.md`);
    });

    it('preserves the anchor on an escaping link', () => {
      expect(rewrite('../../CLAUDE.md#mission')).toBe(`${GITHUB_BLOB}/CLAUDE.md#mission`);
    });
  });

  describe('safety', () => {
    it('neutralises javascript: URLs', () => {
      expect(rewrite('javascript:alert(1)')).toBe('');
    });

    it('neutralises data: and vbscript: URLs', () => {
      expect(rewrite('data:text/html;base64,PHN2Zz4=')).toBe('');
      expect(rewrite('vbscript:msgbox(1)')).toBe('');
    });

    it('does not resolve a traversal escape into an on-site docs URL', () => {
      // Path traversal must never produce a DOCS_PREFIX link for a file
      // outside docsRoot.
      expect(rewrite('../../../etc/passwd')).not.toContain(DOCS_PREFIX);
    });
  });

  describe('deriveDocsContext', () => {
    it('splits an absolute docs path into root and relative path', () => {
      expect(deriveDocsContext('/repo/docs/architecture/README.md')).toEqual({
        docsRoot: '/repo/docs/',
        currentFilePath: 'architecture/README.md',
      });
    });

    it('returns null for a path outside any docs/ tree', () => {
      expect(deriveDocsContext('/somewhere/else/README.md')).toBeNull();
    });

    it('returns null for an empty path', () => {
      expect(deriveDocsContext('')).toBeNull();
    });

    it('uses the LAST docs/ segment when the path nests one', () => {
      expect(deriveDocsContext('/repo/docs/vendor/docs/guide.md')).toEqual({
        docsRoot: '/repo/docs/vendor/docs/',
        currentFilePath: 'guide.md',
      });
    });
  });

  describe('satteri plugin wiring', () => {
    interface Recorded {
      key: string;
      value: unknown;
    }

    /** Minimal stand-in for Sätteri's MdastVisitorContext. */
    interface FakeCtx {
      fileURL: URL | undefined;
      setProperty: (node: unknown, key: string, value: unknown) => void;
    }

    function fakeCtx(fileURL: URL | undefined, recorded: Recorded[]): FakeCtx {
      return {
        fileURL,
        setProperty: (_node: unknown, key: string, value: unknown): void => {
          recorded.push({ key, value });
        },
      };
    }

    function visit(url: string, fileURL: URL | undefined): Recorded[] {
      const recorded: Recorded[] = [];
      const plugin = mdastRewriteLinks() as unknown as {
        link: (n: { url: string }, c: unknown) => void;
      };
      plugin.link({ url }, fakeCtx(fileURL, recorded));
      return recorded;
    }

    it('declares a stable plugin name', () => {
      expect((mdastRewriteLinks() as unknown as { name: string }).name).toBe('nexus-rewrite-links');
    });

    it('subscribes to link nodes', () => {
      expect(typeof (mdastRewriteLinks() as unknown as { link: unknown }).link).toBe('function');
    });

    it('writes the rewritten href back via setProperty', () => {
      const recorded = visit(
        './ROUTING_SYSTEM.md',
        new URL(`file://${join(docsRoot, 'architecture/README.md')}`)
      );
      expect(recorded).toEqual([
        { key: 'url', value: `${DOCS_PREFIX}/architecture/routing_system/` },
      ]);
    });

    it('does not touch a link it decided to leave alone', () => {
      const recorded = visit(
        'https://example.com',
        new URL(`file://${join(docsRoot, 'architecture/README.md')}`)
      );
      expect(recorded).toEqual([]);
    });

    it('is a no-op when the compile supplied no fileURL', () => {
      expect(visit('./ROUTING_SYSTEM.md', undefined)).toEqual([]);
    });

    it('is a no-op for a document outside a docs/ tree', () => {
      expect(visit('./ROUTING_SYSTEM.md', new URL('file:///somewhere/else/README.md'))).toEqual([]);
    });
  });
});
