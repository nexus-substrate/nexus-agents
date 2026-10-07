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
 *   - the number of pages MISSING either key growing past the committed
 *     baseline (docs/ops/diataxis-frontmatter-baseline.json). The two keys are
 *     counted separately so progress on one cannot hide a regression on the
 *     other.
 *
 * The missing-declaration count is a ratchet, not a requirement: the tree
 * started with no declarations at all, and #7198 classifies the pages. When
 * the count falls, `--update-baseline` locks the gain in.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-diataxis-frontmatter.ts                    # CI gate
 *   pnpm exec tsx scripts/check-diataxis-frontmatter.ts --update-baseline  # rewrite baseline
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const ROOT = process.cwd();
const DOCS_DIR = join(ROOT, 'docs');
const EXCLUDED_PREFIXES = ['docs/api/'];
const KINDS_FILE = join(ROOT, 'docs', 'ops', 'diataxis-none-kinds.json');
const BASELINE_FILE = join(ROOT, 'docs', 'ops', 'diataxis-frontmatter-baseline.json');

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
const Count = z.number().int().nonnegative();
const BaselineFileSchema = z.object({
  missing: z.object({ diataxis: Count, audience: Count }),
});

export type NoneKind = Omit<z.infer<typeof KindSchema>, 'description'>;
export type NoneKinds = Record<string, NoneKind>;
export interface MissingCounts {
  diataxis: number;
  audience: number;
}
export interface PageResult {
  path: string;
  errors: string[];
  missing: { diataxis: boolean; audience: boolean };
}
export type FrontmatterParse =
  { ok: true; data: Record<string, unknown> | null } | { ok: false; error: string };
export interface Verdict {
  status: 'pass' | 'fail' | 'unmeasured';
  scanned: number;
  missing: MissingCounts;
  invalid: PageResult[];
  grew: Array<keyof MissingCounts>;
  canTighten: boolean;
}

/** Splits off a leading `---` block. `data: null` means the file has none. */
export function parseFrontmatter(src: string): FrontmatterParse {
  const lines = src.split(/\r?\n/);
  if (lines[0] !== '---') return { ok: true, data: null };
  const end = lines.indexOf('---', 1);
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

export function parseBaseline(raw: unknown): MissingCounts {
  return BaselineFileSchema.parse(raw).missing;
}

/** Aggregates page results against the baseline. Zero pages is `unmeasured`. */
export function evaluate(pages: readonly PageResult[], baseline: MissingCounts): Verdict {
  const missing: MissingCounts = {
    diataxis: pages.filter((p) => p.missing.diataxis).length,
    audience: pages.filter((p) => p.missing.audience).length,
  };
  const invalid = pages.filter((p) => p.errors.length > 0);
  const keys: Array<keyof MissingCounts> = ['diataxis', 'audience'];
  const grew = keys.filter((k) => missing[k] > baseline[k]);
  const canTighten = keys.some((k) => missing[k] < baseline[k]);

  let status: Verdict['status'];
  if (pages.length === 0) status = 'unmeasured';
  else if (invalid.length > 0 || grew.length > 0) status = 'fail';
  else status = 'pass';

  return { status, scanned: pages.length, missing, invalid, grew, canTighten };
}

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

function collectPages(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = toPosix(relative(ROOT, full));
    if (EXCLUDED_PREFIXES.some((p) => `${rel}/`.startsWith(p))) continue;
    if (entry.isDirectory()) out.push(...collectPages(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out.sort();
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8')) as unknown;
}

function report(v: Verdict): void {
  for (const p of v.invalid) {
    for (const e of p.errors) console.error(`  ✗ ${p.path}: ${e}`);
  }
  for (const k of v.grew) {
    console.error(
      `  ✗ pages missing \`${k}\` grew past the baseline. Declare it on the new or edited ` +
        'pages (see skills/diataxis/SKILL.md).'
    );
  }
}

/** Reads a JSON config through `parse`; exits non-zero on any read or shape error. */
function loadOrExit<T>(file: string, parse: (raw: unknown) => T): T {
  try {
    return parse(readJson(file));
  } catch (err) {
    // An unreadable config or baseline is a failure, not a pass.
    console.error(
      `diataxis-frontmatter: cannot read ${toPosix(relative(ROOT, file))}: ${(err as Error).message}`
    );
    process.exit(1);
  }
}

function writeBaseline(pages: readonly PageResult[]): void {
  const v = evaluate(pages, { diataxis: 0, audience: 0 });
  if (v.status === 'unmeasured') {
    console.error(
      'diataxis-frontmatter: UNMEASURED — scanned 0 pages; refusing to write a baseline.'
    );
    process.exit(1);
  }
  writeFileSync(BASELINE_FILE, `${JSON.stringify({ missing: v.missing }, null, 2)}\n`);
  console.log(
    `diataxis-frontmatter: baseline written — ${String(v.missing.diataxis)} missing diataxis, ` +
      `${String(v.missing.audience)} missing audience, of ${String(v.scanned)} pages.`
  );
}

function main(): void {
  const kinds = loadOrExit(KINDS_FILE, parseNoneKinds);
  const pages = collectPages(DOCS_DIR).map((f) =>
    checkPage(toPosix(relative(ROOT, f)), readFileSync(f, 'utf8'), kinds)
  );

  if (process.argv.includes('--update-baseline')) {
    writeBaseline(pages);
    return;
  }

  const baseline = loadOrExit(BASELINE_FILE, parseBaseline);
  const v = evaluate(pages, baseline);
  if (v.status === 'unmeasured') {
    console.error(
      'diataxis-frontmatter: UNMEASURED — scanned 0 pages under docs/. The scan broke; the tree is not clean.'
    );
    process.exit(1);
  }
  report(v);
  console.log(
    `diataxis-frontmatter: ${v.status.toUpperCase()} — ${String(v.scanned)} pages, ` +
      `${String(v.invalid.length)} invalid; missing diataxis ${String(v.missing.diataxis)}/${String(baseline.diataxis)}, ` +
      `missing audience ${String(v.missing.audience)}/${String(baseline.audience)} (current/baseline).`
  );
  if (v.status === 'pass' && v.canTighten) {
    console.log(
      '  The missing count fell. Lock it in: pnpm exec tsx scripts/check-diataxis-frontmatter.ts --update-baseline'
    );
  }
  process.exit(v.status === 'pass' ? 0 : 1);
}

if (process.argv[1]?.endsWith('check-diataxis-frontmatter.ts') === true) main();
