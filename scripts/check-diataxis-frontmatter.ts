/**
 * Diátaxis frontmatter gate (#7196, epic #7203).
 *
 * Every page under `docs/` (except the generated `docs/api/`) should say what
 * kind of document it is, so a reviewer can tell a tutorial from a reference
 * page and catch a page that mixes them. The contract, documented in
 * skills/diataxis/SKILL.md:
 *
 *   diataxis: tutorial | how-to | reference | explanation | none
 *   audience: user | project
 *
 * Each key takes exactly ONE scalar value. `none` is allowed only on a page of
 * a named kind (index pages, ADRs, changelogs, research notes, archive), and
 * the kinds are defined in one place: docs/ops/diataxis-none-kinds.json.
 *
 * What fails:
 *   - an invalid value, a list value, or a key present with no value;
 *   - `diataxis: none` on a page outside every named kind;
 *   - malformed frontmatter;
 *   - zero pages scanned — reported as `unmeasured`, because a scan that finds
 *     nothing has measured nothing, not found a clean tree;
 *   - any drift from the committed baseline
 *     (docs/ops/diataxis-frontmatter-baseline.json), which lists, per key, the
 *     exact set of pages allowed to omit it:
 *       - an undeclared page that is not in the set (new debt);
 *       - a listed page that now declares the key (stale entry);
 *       - a listed path that no longer exists (stale entry).
 *
 * WHY A SET, NOT A COUNT. A count ratchet passes when one page is declared and
 * another is added undeclared (the swap), and it lets the slack from a fixed
 * page be spent later. A set has neither hole, and failing on stale entries
 * means every gain is locked in by the PR that made it.
 *
 * `--update-baseline` only REMOVES entries. Adding one needs `--allow-growth`
 * as well, so loosening the ratchet is an explicit, reviewable act.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-diataxis-frontmatter.ts                    # CI gate
 *   pnpm exec tsx scripts/check-diataxis-frontmatter.ts --update-baseline  # drop stale entries
 *   pnpm exec tsx scripts/check-diataxis-frontmatter.ts --update-baseline --allow-growth
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const EXCLUDED_PREFIXES = ['docs/api/'];
const KINDS_REL = 'docs/ops/diataxis-none-kinds.json';
const BASELINE_REL = 'docs/ops/diataxis-frontmatter-baseline.json';
const KEYS = ['diataxis', 'audience'] as const;

export const DIATAXIS_VALUES = ['tutorial', 'how-to', 'reference', 'explanation', 'none'] as const;
export const AUDIENCE_VALUES = ['user', 'project'] as const;

const KindSchema = z.object({
  description: z.string().optional(),
  basenames: z.array(z.string()),
  pathPrefixes: z.array(z.string()),
});
const KindsFileSchema = z.object({
  description: z.string().optional(),
  kinds: z.record(z.string(), KindSchema),
});
const PathSet = z
  .array(z.string())
  .refine((xs) => new Set(xs).size === xs.length, { message: 'duplicate path in baseline' });
const BaselineFileSchema = z.object({
  missing: z.object({ diataxis: PathSet, audience: PathSet }),
});

type Key = (typeof KEYS)[number];
export type NoneKind = Omit<z.infer<typeof KindSchema>, 'description'>;
export type NoneKinds = Record<string, NoneKind>;
/** Per key, the sorted set of page paths that omit it. */
export type Baseline = Record<Key, string[]>;
export interface PageResult {
  path: string;
  errors: string[];
  missing: Record<Key, boolean>;
}
export type FrontmatterParse =
  { ok: true; data: Record<string, unknown> | null } | { ok: false; error: string };
export interface Verdict {
  status: 'pass' | 'fail' | 'unmeasured';
  scanned: number;
  /** What the tree omits now. */
  missing: Baseline;
  invalid: PageResult[];
  /** Undeclared now, not in the baseline. */
  newlyMissing: Baseline;
  /** In the baseline, but the page now declares the key. */
  nowDeclared: Baseline;
  /** In the baseline, but the path is no longer a scanned page. */
  vanished: Baseline;
}
export type BaselineUpdate =
  | { ok: true; baseline: Baseline }
  | { ok: false; reason: 'unmeasured' }
  | { ok: false; reason: 'growth'; added: Baseline };
export interface CliResult {
  code: number;
  out: string[];
  err: string[];
}

/** Splits off a leading `---` block. `data: null` means the file has none. */
export function parseFrontmatter(src: string): FrontmatterParse {
  const lines = src.replace(/^\uFEFF/, '').split(/\r?\n/);
  const isFence = (line: string | undefined): boolean => line?.trimEnd() === '---';
  if (!isFence(lines[0])) return { ok: true, data: null };
  const end = lines.findIndex((line, i) => i > 0 && isFence(line));
  if (end === -1) return { ok: false, error: 'frontmatter opened with --- but never closed' };
  let parsed: unknown;
  try {
    parsed = parseYaml(lines.slice(1, end).join('\n'));
  } catch (err) {
    return { ok: false, error: `frontmatter is not valid YAML: ${(err as Error).message}` };
  }
  if (parsed === null || parsed === undefined) return { ok: true, data: {} };
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'frontmatter is not a key/value mapping' };
  }
  return { ok: true, data: parsed as Record<string, unknown> };
}

/** Returns the named kind a page belongs to, or undefined. */
export function matchNoneKind(relPath: string, kinds: NoneKinds): string | undefined {
  const name = basename(relPath).toLowerCase();
  for (const [kind, rule] of Object.entries(kinds)) {
    if (rule.basenames.some((b) => b.toLowerCase() === name)) return kind;
    if (rule.pathPrefixes.some((p) => relPath.startsWith(p))) return kind;
  }
  return undefined;
}

function checkScalar(key: string, value: unknown, allowed: readonly string[]): string | undefined {
  if (Array.isArray(value)) {
    return `${key} must be a single value, got a list: ${JSON.stringify(value)}`;
  }
  if (typeof value !== 'string' || !allowed.includes(value)) {
    return `${key} must be one of ${allowed.join(' | ')}, got ${JSON.stringify(value)}`;
  }
  return undefined;
}

/** Checks one page's frontmatter against the contract. */
export function checkPage(relPath: string, src: string, kinds: NoneKinds): PageResult {
  const result: PageResult = {
    path: relPath,
    errors: [],
    missing: { diataxis: false, audience: false },
  };
  const fm = parseFrontmatter(src);
  if (!fm.ok) {
    result.errors.push(fm.error);
    return result;
  }
  const data = fm.data ?? {};

  if (!Object.hasOwn(data, 'diataxis')) {
    result.missing.diataxis = true;
  } else {
    const err = checkScalar('diataxis', data['diataxis'], DIATAXIS_VALUES);
    if (err !== undefined) {
      result.errors.push(err);
    } else if (data['diataxis'] === 'none' && matchNoneKind(relPath, kinds) === undefined) {
      result.errors.push(
        `diataxis: none is allowed only on the kinds in docs/ops/diataxis-none-kinds.json ` +
          `(${Object.keys(kinds).join(', ') || 'none configured'}); declare one of the four types`
      );
    }
  }

  if (!Object.hasOwn(data, 'audience')) {
    result.missing.audience = true;
  } else {
    const err = checkScalar('audience', data['audience'], AUDIENCE_VALUES);
    if (err !== undefined) result.errors.push(err);
  }
  return result;
}

/** Validates the kinds config. Zero kinds, or a kind that matches nothing, is a config error. */
export function parseNoneKinds(raw: unknown): NoneKinds {
  const file = KindsFileSchema.parse(raw);
  const entries = Object.entries(file.kinds);
  if (entries.length === 0) throw new Error('diataxis-none-kinds.json defines no kinds');
  const kinds: NoneKinds = {};
  for (const [name, rule] of entries) {
    if (rule.basenames.length === 0 && rule.pathPrefixes.length === 0) {
      throw new Error(`kind "${name}" has no basenames and no pathPrefixes, so it matches nothing`);
    }
    kinds[name] = { basenames: rule.basenames, pathPrefixes: rule.pathPrefixes };
  }
  return kinds;
}

export function parseBaseline(raw: unknown): Baseline {
  const { missing } = BaselineFileSchema.parse(raw);
  return { diataxis: missing.diataxis, audience: missing.audience };
}

function emptyBaseline(): Baseline {
  return { diataxis: [], audience: [] };
}

function currentMissing(pages: readonly PageResult[]): Baseline {
  const out = emptyBaseline();
  for (const k of KEYS)
    out[k] = pages
      .filter((p) => p.missing[k])
      .map((p) => p.path)
      .sort();
  return out;
}

function isEmpty(b: Baseline): boolean {
  return KEYS.every((k) => b[k].length === 0);
}

/** Compares the tree with the baseline set. Zero pages is `unmeasured`. */
export function evaluate(pages: readonly PageResult[], baseline: Baseline): Verdict {
  const missing = currentMissing(pages);
  const scannedPaths = new Set(pages.map((p) => p.path));
  const newlyMissing = emptyBaseline();
  const nowDeclared = emptyBaseline();
  const vanished = emptyBaseline();
  for (const k of KEYS) {
    const listed = new Set(baseline[k]);
    const now = new Set(missing[k]);
    newlyMissing[k] = missing[k].filter((p) => !listed.has(p));
    vanished[k] = [...listed].filter((p) => !scannedPaths.has(p)).sort();
    nowDeclared[k] = [...listed].filter((p) => scannedPaths.has(p) && !now.has(p)).sort();
  }
  const invalid = pages.filter((p) => p.errors.length > 0);

  let status: Verdict['status'];
  // Named explicitly: with no pages every drift list is empty, which would read as a pass.
  if (pages.length === 0) status = 'unmeasured';
  else if (
    invalid.length > 0 ||
    !isEmpty(newlyMissing) ||
    !isEmpty(nowDeclared) ||
    !isEmpty(vanished)
  )
    status = 'fail';
  else status = 'pass';

  return {
    status,
    scanned: pages.length,
    missing,
    invalid,
    newlyMissing,
    nowDeclared,
    vanished,
  };
}

/**
 * The baseline `--update-baseline` would write: the tree's current missing set.
 * Without `allowGrowth` it may only remove entries; an absent old baseline is
 * treated as empty, so seeding one also needs `allowGrowth`.
 */
export function updateBaseline(
  pages: readonly PageResult[],
  old: Baseline | undefined,
  allowGrowth: boolean
): BaselineUpdate {
  if (pages.length === 0) return { ok: false, reason: 'unmeasured' };
  const next = currentMissing(pages);
  const prior = old ?? emptyBaseline();
  const added = emptyBaseline();
  for (const k of KEYS) {
    const listed = new Set(prior[k]);
    added[k] = next[k].filter((p) => !listed.has(p));
  }
  if (!allowGrowth && !isEmpty(added)) return { ok: false, reason: 'growth', added };
  return { ok: true, baseline: next };
}

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

function collectPages(root: string, dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = toPosix(relative(root, full));
    if (EXCLUDED_PREFIXES.some((p) => `${rel}/`.startsWith(p))) continue;
    if (entry.isDirectory()) out.push(...collectPages(root, full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out.sort();
}

function load<T>(root: string, rel: string, parse: (raw: unknown) => T): T {
  return parse(JSON.parse(readFileSync(join(root, rel), 'utf8')) as unknown);
}

function listDrift(label: string, b: Baseline, err: string[]): void {
  for (const k of KEYS) for (const p of b[k]) err.push(`  ✗ ${p}: ${label} (\`${k}\`)`);
}

function runUpdate(pages: readonly PageResult[], root: string, argv: readonly string[]): CliResult {
  const out: string[] = [];
  const err: string[] = [];
  const old = existsSync(join(root, BASELINE_REL))
    ? load(root, BASELINE_REL, parseBaseline)
    : undefined;
  const r = updateBaseline(pages, old, argv.includes('--allow-growth'));
  if (!r.ok && r.reason === 'unmeasured') {
    err.push('diataxis-frontmatter: UNMEASURED — scanned 0 pages; refusing to write a baseline.');
    return { code: 1, out, err };
  }
  if (!r.ok) {
    err.push('diataxis-frontmatter: refusing to ADD pages to the baseline without --allow-growth:');
    listDrift('undeclared, not in baseline', r.added, err);
    err.push('  Declare the keys on these pages instead (see skills/diataxis/SKILL.md).');
    return { code: 1, out, err };
  }
  writeFileSync(join(root, BASELINE_REL), `${JSON.stringify({ missing: r.baseline }, null, 2)}\n`);
  out.push(
    `diataxis-frontmatter: baseline written — ${String(r.baseline.diataxis.length)} pages omit ` +
      `diataxis, ${String(r.baseline.audience.length)} omit audience, of ${String(pages.length)}.`
  );
  return { code: 0, out, err };
}

function reportVerdict(v: Verdict, err: string[]): void {
  for (const p of v.invalid) for (const e of p.errors) err.push(`  ✗ ${p.path}: ${e}`);
  listDrift('undeclared and not in the baseline; declare it', v.newlyMissing, err);
  listDrift('now declared but still in the baseline (stale)', v.nowDeclared, err);
  listDrift('listed in the baseline but no longer exists (stale)', v.vanished, err);
  if (!isEmpty(v.nowDeclared) || !isEmpty(v.vanished)) {
    err.push(
      '  Drop the stale entries: pnpm exec tsx scripts/check-diataxis-frontmatter.ts --update-baseline'
    );
  }
}

/** The CLI, with the repo root injected so tests can drive it against a fixture tree. */
export function runCli(argv: readonly string[], root: string): CliResult {
  const out: string[] = [];
  const err: string[] = [];
  let kinds: NoneKinds;
  try {
    kinds = load(root, KINDS_REL, parseNoneKinds);
  } catch (e) {
    err.push(`diataxis-frontmatter: cannot read ${KINDS_REL}: ${(e as Error).message}`);
    return { code: 1, out, err };
  }
  const pages = collectPages(root, join(root, 'docs')).map((f) =>
    checkPage(toPosix(relative(root, f)), readFileSync(f, 'utf8'), kinds)
  );

  try {
    if (argv.includes('--update-baseline')) return runUpdate(pages, root, argv);
  } catch (e) {
    err.push(`diataxis-frontmatter: cannot read ${BASELINE_REL}: ${(e as Error).message}`);
    return { code: 1, out, err };
  }

  let baseline: Baseline;
  try {
    baseline = load(root, BASELINE_REL, parseBaseline);
  } catch (e) {
    // An unreadable baseline is a failure, not a pass.
    err.push(`diataxis-frontmatter: cannot read ${BASELINE_REL}: ${(e as Error).message}`);
    return { code: 1, out, err };
  }

  const v = evaluate(pages, baseline);
  if (v.status === 'unmeasured') {
    err.push(
      'diataxis-frontmatter: UNMEASURED — scanned 0 pages under docs/. The scan broke; the tree is not clean.'
    );
    return { code: 1, out, err };
  }
  reportVerdict(v, err);
  out.push(
    `diataxis-frontmatter: ${v.status.toUpperCase()} — ${String(v.scanned)} pages, ` +
      `${String(v.invalid.length)} invalid; ${String(v.missing.diataxis.length)} omit diataxis, ` +
      `${String(v.missing.audience.length)} omit audience (all in the baseline when PASS).`
  );
  return { code: v.status === 'pass' ? 0 : 1, out, err };
}

if (process.argv[1]?.endsWith('check-diataxis-frontmatter.ts') === true) {
  const r = runCli(process.argv.slice(2), process.cwd());
  for (const line of r.err) console.error(line);
  for (const line of r.out) console.log(line);
  process.exit(r.code);
}
