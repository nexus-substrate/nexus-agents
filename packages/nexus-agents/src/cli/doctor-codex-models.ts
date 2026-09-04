/**
 * nexus-agents/cli - Codex served-model probe (#5091)
 *
 * Compares every codex registry entry's `cliModelName` against the models the
 * installed codex actually serves. The registry pointed two of its three codex
 * entries at slugs codex had stopped serving (`gpt-5.2-codex`, `o3-mini`) for
 * months without anything noticing: unit tests read the registry, not the
 * binary, and the mismatch only surfaces as a rejected `-m` at invocation time.
 *
 * The source of truth is `~/.codex/models_cache.json` (or `$CODEX_HOME`),
 * which codex refreshes from its model endpoint; entries with
 * `visibility: "list"` are what `codex` offers. There is no enumerating
 * subcommand (`codex --help` on 0.146.0 has none), so the cache is the only
 * key-free, non-interactive source.
 *
 * Three verdicts, not two. A missing or unreadable cache is reported as
 * `unmeasured`, never as a pass: the probe cannot tell a served slug from an
 * unserved one without the cache, and reporting health it did not measure is
 * exactly the misreport this repo treats as a governor-path defect.
 *
 * @module cli/doctor-codex-models
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { findInTreeByCli } from '../config/model-config-helpers.js';

/** One codex registry entry, as the probe reports it. */
export interface CodexModelRow {
  readonly id: string;
  readonly cliModelName: string;
}

/**
 * Result of comparing the registry's codex slugs against the served list.
 *
 * `served`/`missing` partition the registry entries that carry a
 * `cliModelName`. `reason` explains a `warn` or `unmeasured` verdict and is
 * null on `pass`.
 */
export interface CodexModelsCheck {
  readonly status: 'pass' | 'warn' | 'unmeasured';
  readonly served: readonly CodexModelRow[];
  readonly missing: readonly CodexModelRow[];
  readonly reason: string | null;
}

/**
 * Where codex keeps its model cache. codex honours `CODEX_HOME` for its config
 * directory; otherwise `~/.codex`.
 */
export function resolveCodexModelsCachePath(
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  const home = env['CODEX_HOME'];
  const codexDir = home !== undefined && home !== '' ? home : join(homedir(), '.codex');
  return join(codexDir, 'models_cache.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Extract the `visibility: "list"` slugs from a raw `models_cache.json`.
 *
 * Returns null when the document is not the cache's shape (unparseable, or no
 * `models` array) so the caller can report `unmeasured` rather than treating
 * a malformed file as "codex serves nothing". Individual malformed rows are
 * skipped, not fatal: one bad entry should not hide the rest.
 */
export function parseServedCodexSlugs(raw: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed['models'])) return null;
  const slugs: string[] = [];
  for (const row of parsed['models'] as unknown[]) {
    if (!isRecord(row)) continue;
    const slug = row['slug'];
    if (typeof slug !== 'string' || slug === '') continue;
    if (row['visibility'] !== 'list') continue;
    slugs.push(slug);
  }
  return slugs;
}

/** Every codex registry entry that names a CLI slug. */
function codexRegistryRows(): CodexModelRow[] {
  return findInTreeByCli('codex').flatMap((e) =>
    e.cliModelName === undefined ? [] : [{ id: e.id, cliModelName: e.cliModelName }]
  );
}

/** The served slugs, or the reason they could not be measured. */
type ServedSlugs = { readonly slugs: readonly string[] } | { readonly unmeasured: string };

/**
 * Read and parse the cache, turning each way it can fail into a named reason
 * so {@link checkCodexModels} reports `unmeasured` instead of guessing.
 */
function readServedSlugs(cachePath: string): ServedSlugs {
  let raw: string;
  try {
    raw = readFileSync(cachePath, 'utf8');
  } catch {
    return {
      unmeasured: `codex model cache not readable at ${cachePath} (codex not installed, or never run)`,
    };
  }
  const slugs = parseServedCodexSlugs(raw);
  if (slugs === null) {
    return { unmeasured: `${cachePath} is unparseable or not a codex model cache` };
  }
  if (slugs.length === 0) {
    return { unmeasured: `${cachePath} lists no models` };
  }
  return { slugs };
}

/**
 * Compare the registry's codex slugs against the served list in `cachePath`.
 *
 * `rows` is injectable so the registry-empty case is reachable from a test.
 * Both empty cases are named: no registry rows and a cache that lists nothing
 * each report `unmeasured`, because `[].every(served)` would render the first
 * as a pass and the second would render every registry slug as missing when
 * the far likelier explanation is a stale or malformed cache.
 */
export function checkCodexModels(
  cachePath: string = resolveCodexModelsCachePath(),
  rows: readonly CodexModelRow[] = codexRegistryRows()
): CodexModelsCheck {
  if (rows.length === 0) {
    return unmeasured('no codex entries in the registry to check');
  }
  const read = readServedSlugs(cachePath);
  if ('unmeasured' in read) {
    return unmeasured(read.unmeasured);
  }

  const servedSet = new Set(read.slugs);
  const served = rows.filter((r) => servedSet.has(r.cliModelName));
  const missing = rows.filter((r) => !servedSet.has(r.cliModelName));
  if (missing.length > 0) {
    const named = missing.map((m) => `${m.id} → ${m.cliModelName}`).join(', ');
    return {
      status: 'warn',
      served,
      missing,
      reason: `not served by the installed codex: ${named}`,
    };
  }
  return { status: 'pass', served, missing, reason: null };
}

function unmeasured(reason: string): CodexModelsCheck {
  return { status: 'unmeasured', served: [], missing: [], reason };
}
