/* eslint-disable no-console */
/**
 * Concern registry ratchet — one canonical implementation per operation (#5123).
 *
 * Epic #5121 found six NEW parallel implementations beyond the two already
 * tracked, and named the root cause: CLAUDE.md's canonical table lists
 * **symbols**, so it could bless both `createAllAdapters()` and
 * `UnifiedAdapterRegistry` — two entries for one question. This registry is
 * keyed on the OPERATION instead, and each entry answers exactly one question.
 *
 * Cleaning up eleven cost paths is worth little if a twelfth can land next
 * week. This is the part that makes the epic durable rather than a one-time
 * sweep.
 *
 * WHAT IT DOES NOT DO. It is not a general duplicate detector — the epic's
 * constraint 1 says buy detection, build only the wrapper. Each concern carries
 * its OWN declared pattern, written by whoever knows what that operation looks
 * like in code. The generic part here is just the diff.
 *
 * PRESENCE, NOT COUNTS. The baseline records that an alternate exists, never
 * how many call sites it has. Counts were the contrarian's strongest objection
 * on the epic: two unrelated PRs touching the same alternate would both mutate
 * the number and the second would hit a merge conflict, punishing a developer
 * with nothing to do with the debt. A gate that does that gets disabled, and a
 * disabled gate is worse than none. `merge=union` was the alternative
 * considered — rejected because union-merging a JSON array produces invalid
 * JSON, unlike the JSONL ledgers it works for.
 *
 * FAILURE MODES, both of which are real:
 *   1. A NEW file matches a concern's pattern and is neither the canonical
 *      implementation nor a known alternate. That is a twelfth path.
 *   2. A registered alternate no longer matches — it was migrated or deleted.
 *      The baseline is then stale and must shrink, so the debt count stays
 *      honest rather than drifting upward forever.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-concern-registry.ts            # CI gate
 *   pnpm exec tsx scripts/check-concern-registry.ts baseline   # reseed alternates
 *
 * @module scripts/check-concern-registry
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT } from './script-paths.js';
import { stripComments } from './check-env-schema-coverage.js';

const REGISTRY_PATH = join(ROOT, 'docs/ops/concern-registry.json');

interface Alternate {
  readonly path: string;
  readonly why?: string;
  readonly trackedBy?: string;
}

interface Concern {
  readonly concern: string;
  readonly question: string;
  readonly canonical: string;
  readonly canonicalSymbol?: string;
  readonly detect: {
    readonly roots: readonly string[];
    readonly pattern: string;
    readonly note?: string;
  };
  readonly alternates: readonly Alternate[];
}

interface Registry {
  readonly concerns: readonly Concern[];
}

/** Every non-test `.ts` file beneath `dir`. */
export function collectFiles(dir: string): readonly string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full));
      continue;
    }
    if (!entry.endsWith('.ts')) continue;
    // Tests legitimately contain the arithmetic they assert on.
    if (entry.includes('.test.') || entry.includes('.spec.')) continue;
    out.push(full);
  }
  return out;
}

/** Repo-relative paths under `concern.detect.roots` whose source matches its pattern. */
export function matchingFiles(concern: Concern, readFile: (p: string) => string): string[] {
  const re = new RegExp(concern.detect.pattern);
  const hits: string[] = [];
  for (const root of concern.detect.roots) {
    for (const file of collectFiles(join(ROOT, root))) {
      // Comments are stripped first: a doc comment that DESCRIBES the
      // arithmetic ("the cost penalty is `tokensUsed * rate`") is not an
      // implementation of it. Reuses the stripper written for the env-schema
      // gate rather than growing a second copy.
      if (re.test(stripComments(readFile(file)))) hits.push(relative(ROOT, file));
    }
  }
  return hits.sort();
}

export interface ConcernDrift {
  readonly concern: string;
  /** Matched, but neither canonical nor a known alternate — a new fork. */
  readonly unregistered: readonly string[];
  /** Registered as an alternate but no longer matching — the baseline is stale. */
  readonly staleAlternates: readonly string[];
}

export function computeDrift(concern: Concern, matched: readonly string[]): ConcernDrift {
  const known = new Set<string>([concern.canonical, ...concern.alternates.map((a) => a.path)]);
  const matchedSet = new Set(matched);

  return {
    concern: concern.concern,
    unregistered: matched.filter((f) => !known.has(f)),
    staleAlternates: concern.alternates.map((a) => a.path).filter((p) => !matchedSet.has(p)),
  };
}

function loadRegistry(): Registry {
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as Registry;
}

function reportDrift(concern: Concern, drift: ConcernDrift): boolean {
  let failed = false;

  if (drift.unregistered.length > 0) {
    failed = true;
    console.error(`\n✗ ${concern.concern}: a NEW implementation appeared.`);
    console.error(`  Question this operation answers: ${concern.question}`);
    console.error(`  Canonical: ${concern.canonical}`);
    for (const f of drift.unregistered) console.error(`  - ${f}`);
    console.error(
      '\n  Route the call through the canonical entry point, or — if it is\n' +
        '  genuinely a different operation — add it to docs/ops/concern-registry.json\n' +
        '  as an alternate WITH a tracking issue. An untracked alternate is how\n' +
        '  eleven implementations accumulated in the first place.'
    );
  }

  if (drift.staleAlternates.length > 0) {
    failed = true;
    console.error(`\n✗ ${concern.concern}: registered alternates no longer match.`);
    for (const f of drift.staleAlternates) console.error(`  - ${f}`);
    console.error('  They were migrated or removed — drop them so the debt count stays honest.');
  }

  return failed;
}

function main(): void {
  const mode = process.argv[2];
  const registry = loadRegistry();
  const read = (p: string): string => readFileSync(p, 'utf8');

  // A registry that matches nothing would pass forever without checking anything.
  if (registry.concerns.length === 0) {
    console.error('concern-registry: no concerns registered. An empty registry is not a check.');
    process.exit(1);
  }

  if (mode === 'baseline') {
    const concerns = registry.concerns.map((c) => {
      const matched = matchingFiles(c, read);
      const existing = new Map(c.alternates.map((a) => [a.path, a]));
      const alternates = matched
        .filter((p) => p !== c.canonical)
        .map((p) => existing.get(p) ?? { path: p, why: 'TODO: describe', trackedBy: 'TODO' });
      return { ...c, alternates };
    });
    writeFileSync(REGISTRY_PATH, `${JSON.stringify({ ...registry, concerns }, null, 2)}\n`);
    console.log('concern-registry: baseline reseeded.');
    return;
  }

  let failed = false;
  for (const concern of registry.concerns) {
    const matched = matchingFiles(concern, read);

    // A pattern matching nothing at all cannot fail, and would silently stop
    // guarding its concern the moment someone edited the regex.
    if (matched.length === 0) {
      console.error(
        `\n✗ ${concern.concern}: its detection pattern matched NO files. ` +
          'It cannot detect a new implementation either. Fix the pattern.'
      );
      failed = true;
      continue;
    }

    if (reportDrift(concern, computeDrift(concern, matched))) failed = true;
  }

  const alternateCount = registry.concerns.reduce((n, c) => n + c.alternates.length, 0);
  console.log(
    `concern-registry: ${String(registry.concerns.length)} concern(s), ` +
      `${String(alternateCount)} known alternate(s) outstanding.`
  );
  process.exit(failed ? 1 : 0);
}

if (process.argv[1]?.endsWith('check-concern-registry.ts') === true) main();
