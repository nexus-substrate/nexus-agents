#!/usr/bin/env npx tsx
/**
 * Pin the generated TypeDoc page layout (#4523).
 *
 * Three of the nineteen entry points emit into a subdirectory —
 * `docs/api/exports/{pipeline,benchmarks,agents-ictm}.md` — because those
 * source barrels carry a slash-bearing `@module exports/<name>` tag and
 * `outputFileStrategy: "modules"` derives the output path from the module
 * name. The other sixteen carry no such tag and land flat.
 *
 * ## Why the asymmetry stays
 *
 * A 7-voter `higher_order` panel on #4523 chose to leave it (5 of 6
 * approvers, leading share 0.833, supermajority). Published doc URLs are a
 * stable interface; `/api/exports/pipeline` is live, and de-slashing three
 * `@module` tags for layout symmetry breaks three URLs to buy nothing a
 * reader can perceive.
 *
 * ## Why a gate and not a paragraph
 *
 * Every voter, including the one who rejected the option, said the same
 * thing: a comment will not survive the next tidy-up. The contrarian's
 * wording was "documentation rots; automated tests do not." The `@module`
 * tags look like an inconsistency, so someone will eventually normalise them,
 * and nothing today would notice. This notices.
 *
 * ## What it asserts, and against what
 *
 * Against the FRESHLY GENERATED tree, not a committed one — there is no
 * committed one to assert against. `docs/api/` has been gitignored and
 * derived since #4449. The gate therefore runs in `docs-check.yml`'s
 * `typedoc-check` job, immediately after `pnpm --filter nexus-agents
 * docs:api:md`, alongside the coverage gate that shares that placement.
 *
 * For every entry point declared in `typedoc.markdown.json` it computes the
 * one path that entry point must produce — `exports/<name>.md` for the three
 * pinned barrels, `<name>.md` for everything else — and requires exactly
 * that. It also fails on any nested page nobody pinned, so a new
 * subdirectory is a decision recorded here rather than a surprise on the
 * published site.
 *
 * Deriving the flat set from the config rather than hardcoding sixteen names
 * means a nineteenth entry point is covered the day it is added.
 *
 * ## What it does NOT catch
 *
 * - **A stale local tree.** It reads whatever `docs/api/` holds. In CI that
 *   is always fresh output from the step before it; run locally without
 *   `pnpm --filter nexus-agents docs:api:md` first and it grades a stale
 *   artifact. Nothing here detects staleness — freshness is the generation
 *   step's job, not this one's.
 * - **Page CONTENT.** A page that exists at the right path but documents the
 *   wrong symbols, or nothing at all, passes. Coverage of the symbol surface
 *   is `check-typedoc-coverage.ts`.
 * - **Anchors within a page.** A URL can break on its fragment without the
 *   file path moving at all.
 * - **The published site.** It grades the generator's output, not what the
 *   website prebuild ultimately deploys.
 *
 * @module scripts/check-typedoc-layout
 * (Source: Issue #4523)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

import { ROOT } from './script-paths.js';

/**
 * Entry points whose page is pinned under `docs/api/exports/`.
 *
 * These are the aggregate `exports/*` barrels whose `@module` tag carries a
 * slash. Removing a name from this list is a decision to break that module's
 * published URL, and #4523 resolved not to. Adding one is the same decision
 * in the other direction.
 */
export const NESTED_MODULES: readonly string[] = ['pipeline', 'benchmarks', 'agents-ictm'];

export interface LayoutInput {
  /** Entry-point basenames declared in `typedoc.markdown.json`. */
  readonly declared: readonly string[];
  /** Generated page paths relative to `docs/api`, POSIX-separated. */
  readonly generated: readonly string[];
  /** Basenames pinned under `exports/`. */
  readonly nested: readonly string[];
}

export interface LayoutVerdict {
  readonly ok: boolean;
  /** Pinned paths that no page occupies, and no page took over either. */
  readonly missing: string[];
  /** Pages that exist but at the wrong path — a moved, i.e. broken, URL. */
  readonly moved: string[];
  /** Pages in a subdirectory that nothing pinned there. */
  readonly unexpectedNested: string[];
  readonly reason: string;
}

/** The single path a declared entry point is required to produce. */
export function expectedPagePath(name: string, nested: readonly string[]): string {
  return nested.includes(name) ? `exports/${name}.md` : `${name}.md`;
}

/** Index pages are navigation scaffolding, not module pages. */
function isIndex(path: string): boolean {
  return basename(path) === 'index.md';
}

/** Compare the generated page layout against the pinned one. */
export function assessLayout(input: LayoutInput): LayoutVerdict {
  const present = new Set(input.generated.filter((p) => !isIndex(p)));
  const pinned = new Set(input.declared.map((n) => expectedPagePath(n, input.nested)));

  const missing: string[] = [];
  const moved: string[] = [];

  for (const name of input.declared) {
    const expected = expectedPagePath(name, input.nested);
    if (present.has(expected)) continue;

    // Did the page merely change depth? That is a broken URL, and it reads
    // very differently in a failure message from a page that is simply gone.
    const alternative = expected.includes('/') ? `${name}.md` : `exports/${name}.md`;
    if (present.has(alternative)) {
      moved.push(`${name}: pinned at ${expected}, found at ${alternative}`);
    } else {
      missing.push(expected);
    }
  }

  const unexpectedNested = [...present]
    .filter((p) => p.includes('/') && !pinned.has(p))
    .sort((a, b) => a.localeCompare(b));

  return {
    ok: moved.length === 0 && missing.length === 0 && unexpectedNested.length === 0,
    missing,
    moved,
    unexpectedNested,
    reason: describe(input, { missing, moved, unexpectedNested }),
  };
}

/** Human-readable summary — the whole finding on one line, or why it is fine. */
function describe(
  input: LayoutInput,
  found: { missing: string[]; moved: string[]; unexpectedNested: string[] }
): string {
  const parts: string[] = [];
  if (found.moved.length > 0) {
    parts.push(`${String(found.moved.length)} page(s) moved: ${found.moved.join('; ')}`);
  }
  if (found.missing.length > 0) {
    parts.push(
      `${String(found.missing.length)} pinned page(s) absent: ${found.missing.join(', ')}`
    );
  }
  if (found.unexpectedNested.length > 0) {
    parts.push(
      `${String(found.unexpectedNested.length)} unpinned nested page(s): ` +
        found.unexpectedNested.join(', ')
    );
  }
  if (parts.length > 0) return parts.join('; ');

  const nestedCount = input.declared.filter((n) => input.nested.includes(n)).length;
  return (
    `Layout intact: ${String(nestedCount)} nested under exports/, ` +
    `${String(input.declared.length - nestedCount)} flat.`
  );
}

/** Entry-point base names declared in the markdown TypeDoc config. */
function readDeclared(): string[] {
  const cfg = join(ROOT, 'packages/nexus-agents/typedoc.markdown.json');
  const parsed = JSON.parse(readFileSync(cfg, 'utf-8')) as { entryPoints?: string[] };
  return (parsed.entryPoints ?? []).map((p) => basename(p, '.ts'));
}

/** Generated page paths relative to `docs/api`. */
function readGenerated(): string[] {
  const dir = join(ROOT, 'docs/api');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf-8' })
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.split(/[\\/]/).join('/'));
}

/* eslint-disable no-console */
function main(): void {
  const verdict = assessLayout({
    declared: readDeclared(),
    generated: readGenerated(),
    nested: NESTED_MODULES,
  });

  console.log(verdict.reason);
  if (!verdict.ok) {
    console.log(
      `::error::Generated TypeDoc layout moved. Published doc URLs are a stable ` +
        `interface (#4523). ${verdict.reason}`
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('check-typedoc-layout.ts') === true) {
  main();
}
