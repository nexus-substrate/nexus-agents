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
 * Retirement look-ahead (#6516). A cache row can carry an `upgrade` record
 * (`{model, retirement_at}`) announcing that codex will stop serving the slug.
 * The served/missing comparison only fires after the slug is gone, so a
 * registry slug whose `retirement_at` falls within
 * {@link RETIREMENT_WARN_DAYS} days — or has already passed — is reported as a
 * warning naming the date and the upgrade target, before calls start failing.
 *
 * @module cli/doctor-codex-models
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { findInTreeByCli } from '../config/model-config-helpers.js';
import { DEFAULT_MODEL_PER_CLI } from '../config/in-tree-data.js';
import type { VerifyCheck } from './verify-command.js';

/** One codex registry entry, as the probe reports it. */
export interface CodexModelRow {
  readonly id: string;
  readonly cliModelName: string;
}

/** Days ahead of a cache-announced retirement at which the check warns. */
const RETIREMENT_WARN_DAYS = 30;

const MS_PER_DAY = 86_400_000;

/** A cache row's announced retirement (`upgrade.retirement_at`). */
interface CodexRetirement {
  readonly slug: string;
  /** ISO-8601, normalised through `Date`. */
  readonly retirementAt: string;
  /** `upgrade.model`, or null when the cache names no successor. */
  readonly upgradeModel: string | null;
}

/** A registry entry whose slug retires within the warning window. */
interface CodexRetiringRow extends CodexModelRow {
  readonly retirementAt: string;
  readonly upgradeModel: string | null;
  /** Whole days until retirement; negative once the date has passed. */
  readonly daysLeft: number;
}

/**
 * Result of comparing the registry's codex slugs against the served list.
 *
 * `served`/`missing` partition the registry entries that carry a
 * `cliModelName`. `retiring` lists registry entries whose slug the cache says
 * retires within {@link RETIREMENT_WARN_DAYS} days (or already has); it is
 * independent of the partition, so a retired slug can be both `missing` and
 * `retiring`. `reason` explains a `warn` or `unmeasured` verdict and is null on
 * `pass`.
 */
export interface CodexModelsCheck {
  readonly status: 'pass' | 'warn' | 'unmeasured';
  readonly served: readonly CodexModelRow[];
  readonly missing: readonly CodexModelRow[];
  readonly retiring: readonly CodexRetiringRow[];
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

/** What a parse of `models_cache.json` found. */
export interface ParsedCodexCache {
  /** Slugs with `visibility: "list"` — what `codex` offers. */
  readonly listed: readonly string[];
  /** Well-formed `{slug}` rows of any visibility. */
  readonly rows: number;
  /** Well-formed rows that carry no `visibility` field at all. */
  readonly withoutVisibility: number;
  /** Rows of any visibility whose `upgrade` record names a valid `retirement_at`. */
  readonly retirements: readonly CodexRetirement[];
}

/** Every well-formed row's announced retirement, of any visibility. */
function parseRetirements(models: readonly unknown[]): CodexRetirement[] {
  return models.flatMap((row) => {
    if (!isRecord(row)) return [];
    const slug = row['slug'];
    if (typeof slug !== 'string' || slug === '') return [];
    const retirement = parseRetirement(slug, row['upgrade']);
    return retirement === null ? [] : [retirement];
  });
}

/**
 * Read a row's `upgrade` record. Absent, null, or a `retirement_at` that is not
 * a parseable date all yield null: there is no retirement to warn about, and
 * inventing one from a malformed field would be a warning nobody can act on.
 */
function parseRetirement(slug: string, upgrade: unknown): CodexRetirement | null {
  if (!isRecord(upgrade)) return null;
  const at = upgrade['retirement_at'];
  if (typeof at !== 'string') return null;
  const time = Date.parse(at);
  if (Number.isNaN(time)) return null;
  const model = upgrade['model'];
  return {
    slug,
    retirementAt: new Date(time).toISOString(),
    upgradeModel: typeof model === 'string' && model !== '' ? model : null,
  };
}

/**
 * Parse a raw `models_cache.json`.
 *
 * Returns null when the document is not the cache's shape (unparseable, or no
 * `models` array) so the caller can report `unmeasured` rather than treating
 * a malformed file as "codex serves nothing". Individual malformed rows are
 * skipped, not fatal: one bad entry should not hide the rest. Rows that lack
 * `visibility` are counted separately so the caller can say "the cache has
 * models but not the field this probe reads" instead of "lists no models".
 */
export function parseServedCodexSlugs(raw: string): ParsedCodexCache | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed['models'])) return null;
  const listed: string[] = [];
  let rows = 0;
  let withoutVisibility = 0;
  for (const row of parsed['models'] as unknown[]) {
    if (!isRecord(row)) continue;
    const slug = row['slug'];
    if (typeof slug !== 'string' || slug === '') continue;
    rows += 1;
    if (row['visibility'] === undefined) withoutVisibility += 1;
    if (row['visibility'] === 'list') listed.push(slug);
  }
  const retirements = parseRetirements(parsed['models'] as unknown[]);
  return { listed, rows, withoutVisibility, retirements };
}

/** Every codex registry entry that names a CLI slug. */
function codexRegistryRows(): CodexModelRow[] {
  return findInTreeByCli('codex').flatMap((e) =>
    e.cliModelName === undefined ? [] : [{ id: e.id, cliModelName: e.cliModelName }]
  );
}

/** The served slugs, or the reason they could not be measured. */
type ServedSlugs =
  | { readonly slugs: readonly string[]; readonly retirements: readonly CodexRetirement[] }
  | { readonly unmeasured: string };

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
  const parsed = parseServedCodexSlugs(raw);
  if (parsed === null) {
    return { unmeasured: `${cachePath} is unparseable or not a codex model cache` };
  }
  if (parsed.listed.length === 0) {
    if (parsed.withoutVisibility > 0) {
      return {
        unmeasured: `${cachePath} lists ${String(parsed.withoutVisibility)} model row(s) with no visibility field (unexpected cache shape; this probe reads visibility=list)`,
      };
    }
    if (parsed.rows === 0) {
      return { unmeasured: `${cachePath} lists no models` };
    }
    return {
      unmeasured: `${cachePath} lists ${String(parsed.rows)} model(s), none with visibility=list`,
    };
  }
  return { slugs: parsed.listed, retirements: parsed.retirements };
}

/**
 * Compare the registry's codex slugs against the served list in `cachePath`.
 *
 * `rows` is injectable so the registry-empty case is reachable from a test;
 * `now` is injectable so the retirement window is testable against a fixed
 * clock.
 * Both empty cases are named: no registry rows and a cache that lists nothing
 * each report `unmeasured`, because `[].every(served)` would render the first
 * as a pass and the second would render every registry slug as missing when
 * the far likelier explanation is a stale or malformed cache.
 */
export function checkCodexModels(
  cachePath: string = resolveCodexModelsCachePath(),
  rows: readonly CodexModelRow[] = codexRegistryRows(),
  now: Date = new Date()
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
  const retiring = findRetiring(rows, read.retirements, now);
  // Each cause renders on its own: a retired slug is usually also missing,
  // and folding one into the other would hide the upgrade target.
  const reasons: string[] = [];
  if (missing.length > 0) {
    const named = missing.map((m) => `${m.id} → ${m.cliModelName}`).join(', ');
    reasons.push(`not served by the installed codex: ${named}`);
  }
  if (retiring.length > 0) {
    reasons.push(
      `retiring per the codex cache (within ${String(RETIREMENT_WARN_DAYS)} days): ${retiring
        .map(describeRetirement)
        .join(', ')}`
    );
  }
  if (reasons.length > 0) {
    return { status: 'warn', served, missing, retiring, reason: reasons.join('; ') };
  }
  return { status: 'pass', served, missing, retiring, reason: null };
}

/** Registry rows whose slug retires within the window, or already has. */
function findRetiring(
  rows: readonly CodexModelRow[],
  retirements: readonly CodexRetirement[],
  now: Date
): CodexRetiringRow[] {
  const bySlug = new Map(retirements.map((r) => [r.slug, r]));
  return rows.flatMap((row) => {
    const retirement = bySlug.get(row.cliModelName);
    if (retirement === undefined) return [];
    const msLeft = Date.parse(retirement.retirementAt) - now.getTime();
    if (msLeft > RETIREMENT_WARN_DAYS * MS_PER_DAY) return [];
    return [
      {
        ...row,
        retirementAt: retirement.retirementAt,
        upgradeModel: retirement.upgradeModel,
        // floor, not trunc: a few hours past the date is "retired", never "in 0 days".
        daysLeft: Math.floor(msLeft / MS_PER_DAY),
      },
    ];
  });
}

function describeRetirement(r: CodexRetiringRow): string {
  const date = r.retirementAt.slice(0, 10);
  const when =
    r.daysLeft < 0
      ? `retired ${date} (${String(-r.daysLeft)} day(s) ago)`
      : `retires ${date} (in ${String(r.daysLeft)} day(s))`;
  const upgrade = r.upgradeModel === null ? 'no upgrade model named' : `upgrade: ${r.upgradeModel}`;
  return `${r.id} → ${r.cliModelName} ${when}, ${upgrade}`;
}

function unmeasured(reason: string): CodexModelsCheck {
  return { status: 'unmeasured', served: [], missing: [], retiring: [], reason };
}

const CHECK_NAME = 'Codex Models';

/**
 * Render a {@link CodexModelsCheck} as the `nexus-agents verify` row.
 *
 * `warn`, matching the other environment checks: nexus-agents runs, but every
 * codex invocation that resolves to a dead slug is rejected, and a retiring
 * slug will be. A warn still lists the served slugs, so a retirement-only
 * warning does not hide that the successor is available. `unmeasured` renders
 * as a warn whose message says so, never as a pass, because `VerifyCheck` has
 * no third state and a pass would claim a measurement that was not taken.
 */
/** Options for rendering the codex models verification check. */
export interface CodexModelsVerifyCheckOptions {
  /**
   * Whether the codex binary is installed. When false, the check reports
   * `passed: true` with message `skipped: codex not installed`.
   */
  readonly isCodexInstalled?: boolean | undefined;
  /**
   * Model slug pinned in user configuration (e.g. `nexus-agents.yaml`).
   * When user config pins a retiring slug, the check escalates to a warning.
   */
  readonly userPinnedSlug?: string | undefined;
  /**
   * Active default model name (e.g. 'gpt-5.6-sol').
   */
  readonly defaultModel?: string | undefined;
}

interface EvaluatedRetirements {
  readonly warns: readonly string[];
  readonly infoNotes: readonly string[];
  readonly upgradeTargets: readonly string[];
}

function evaluateRetirements(
  retiring: readonly CodexRetiringRow[],
  options?: CodexModelsVerifyCheckOptions
): EvaluatedRetirements {
  const warns: string[] = [];
  const infoNotes: string[] = [];
  const upgradeTargets: string[] = [];
  const defaultModelName = options?.defaultModel ?? DEFAULT_MODEL_PER_CLI.codex;

  for (const r of retiring) {
    const date = r.retirementAt.slice(0, 10);
    const isPast = r.daysLeft < 0;
    const isPinned =
      options?.userPinnedSlug !== undefined && options.userPinnedSlug === r.cliModelName;

    if (isPast) {
      warns.push(`${r.id} → ${r.cliModelName} retired ${date} (${String(-r.daysLeft)} day(s) ago)`);
      if (r.upgradeModel !== null) upgradeTargets.push(r.upgradeModel);
    } else if (isPinned) {
      warns.push(`user config pins retiring slug ${r.cliModelName} (retires ${date})`);
      if (r.upgradeModel !== null) upgradeTargets.push(r.upgradeModel);
    } else {
      infoNotes.push(
        `${r.cliModelName} retires ${date}; nexus-agents default is ${defaultModelName}`
      );
    }
  }

  return { warns, infoNotes, upgradeTargets };
}

function buildVerifyFixes(missingCount: number, upgradeTargets: readonly string[]): string {
  const fixes: string[] = [];
  if (missingCount > 0) {
    fixes.push('Update nexus-agents, or configure a supported model in nexus-agents.yaml');
  }
  if (upgradeTargets.length > 0) {
    const target = upgradeTargets[0];
    if (target !== undefined) {
      fixes.push(`Update nexus-agents, or set your model to ${target} in nexus-agents.yaml`);
    } else {
      fixes.push('Update nexus-agents, or configure a supported model in nexus-agents.yaml');
    }
  }
  return fixes.join('; ');
}

/**
 * Render a {@link CodexModelsCheck} as the `nexus-agents verify` row.
 *
 * When codex is absent, reports skipped rather than degraded (#6535).
 * Planned retirements in the window with default migrated report as info.
 * Warning triggers only when user config pins the retiring slug, the retirement
 * date has passed, or a registry slug is not served.
 */
export function codexModelsVerifyCheck(
  result: CodexModelsCheck,
  options?: CodexModelsVerifyCheckOptions
): VerifyCheck {
  if (options?.isCodexInstalled === false) {
    return { name: CHECK_NAME, passed: true, message: 'skipped: codex not installed' };
  }
  if (result.status === 'unmeasured') {
    return {
      name: CHECK_NAME,
      passed: false,
      severity: 'warn',
      message: `unmeasured: ${result.reason ?? 'codex model list unavailable'}`,
      fix: 'Run codex once so ~/.codex/models_cache.json exists, then re-run verify',
    };
  }

  const servedList = `${String(result.served.length)} codex registry slug(s) served: ${result.served
    .map((r) => r.cliModelName)
    .join(', ')}`;

  const missingReasons: string[] = [];
  if (result.missing.length > 0) {
    const named = result.missing.map((m) => `${m.id} → ${m.cliModelName}`).join(', ');
    missingReasons.push(`not served by the installed codex: ${named}`);
  }

  const { warns, infoNotes, upgradeTargets } = evaluateRetirements(result.retiring, options);
  const allWarnings = [...missingReasons, ...warns];

  if (allWarnings.length > 0) {
    return {
      name: CHECK_NAME,
      passed: false,
      severity: 'warn',
      message: `${allWarnings.join('; ')}; ${servedList}`,
      fix: buildVerifyFixes(result.missing.length, upgradeTargets),
    };
  }

  const message = infoNotes.length > 0 ? `${servedList} (${infoNotes.join('; ')})` : servedList;
  return { name: CHECK_NAME, passed: true, message };
}
