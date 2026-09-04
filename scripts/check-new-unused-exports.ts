/* eslint-disable no-console */
/**
 * Producer-without-consumer gate (#3024).
 *
 * Catches the recurring dead-code shape that caused the 2026-05-24
 * audit sweep: a producer/utility (emit helper, store class, validator,
 * estimator, expert-bridge) is built and exported on a public barrel,
 * but the consumer never lands. The audit deleted ~5,250 LOC across 7
 * issues all with the same shape (#2921 / #2937 / #2938 / #2939 /
 * #2940 / #3018 / #3022).
 *
 * **What it checks:** new `.ts` files added under
 * `packages/nexus-agents/src/**` in this PR. For each new file, the
 * script walks the rest of `packages/nexus-agents/src/**` looking for
 * at least one non-test, non-barrel import that references the new
 * file. If none is found, the file is flagged.
 *
 * **What it does NOT check** (out of scope for v1):
 * - New exports added to *existing* files (most of the audit-sweep
 *   examples were new files; new-export-in-existing-file detection
 *   needs an AST diff against the base ref, which is meaningful future
 *   work).
 * - Type-only consumers, generic types referenced in `import type`
 *   chains (greedy grep catches these but doesn't distinguish them).
 *
 * **Opt-out:** add `// @export-no-consumer-yet — see #<issue>` somewhere
 * in the new file. The marker requires a tracking-issue reference so
 * deferred-but-tracked work doesn't bypass the gate without trace.
 * Failure to file the tracking issue forces the deletion-by-default
 * outcome the audit sweep just established.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-new-unused-exports.ts [base-ref]
 *   (base defaults to origin/main)
 *
 * @module scripts/check-new-unused-exports
 * (Source: #3024 — lessons from 7-issue YAGNI sweep)
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const SRC_DIR = 'packages/nexus-agents/src';
const SRC_PATTERN = /^packages\/nexus-agents\/src\/.+\.tsx?$/;
const OPT_OUT_MARKER = /\/\/\s*@export-no-consumer-yet\s*—?\s*see\s*#\d+/;

/** True for test files, which never need a consumer check. */
function isTestFile(file: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(file) || file.includes('/__tests__/');
}

/** True for barrel files (index.ts re-exports). Barrels can't satisfy "needs a consumer." */
function isBarrelFile(file: string): boolean {
  return /\/index\.tsx?$/.test(file) || /\/exports\//.test(file);
}

/** True for declaration-only files (.d.ts). */
function isDeclarationFile(file: string): boolean {
  return file.endsWith('.d.ts');
}

export interface NewFilesClassification {
  /** Newly added source files that need a consumer check. */
  newSourceFiles: string[];
  /** Newly added files we'll skip (tests, barrels, declarations). */
  skipped: string[];
}

/** Classify added files into checkable vs skipped. */
export function classifyAddedFiles(files: string[]): NewFilesClassification {
  const newSourceFiles: string[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    if (!SRC_PATTERN.test(f)) continue;
    if (isTestFile(f) || isBarrelFile(f) || isDeclarationFile(f)) {
      skipped.push(f);
      continue;
    }
    newSourceFiles.push(f);
  }
  return { newSourceFiles, skipped };
}

/** List ADDED files since `base` (status A in `git diff --name-status`). */
function addedFiles(base: string): string[] {
  const out = execSync(`git diff --name-status --diff-filter=A ${base}...HEAD`, {
    encoding: 'utf-8',
  });
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/).slice(1).join(' '));
}

/** Read a file's contents (returns empty string on missing file). */
function safeRead(file: string): string {
  if (!existsSync(file)) return '';
  return readFileSync(file, 'utf-8');
}

/**
 * Build the regex set that recognizes an import-specifier ending in the
 * given file's basename. The codebase uses ESM imports with `.js`
 * extensions:
 *
 *   import { Foo } from './path/to/file.js';
 *   import { Foo } from '../path/to/file.js';
 *   import type { Bar } from '../path/to/file.js';
 *
 * A DYNAMIC import counts too:
 *
 *   const { run } = await import('./path/to/file.js');
 *
 * It has no `from`, so a `from`-only pattern reports a genuinely-consumed
 * module as dead — and lazy `await import(...)` is the established shape for
 * opt-in CLI subcommands here (`doctor-deep`, `doctor-live`), precisely the
 * code most likely to be new. A gate that fires on the repo's own convention
 * teaches people to reach for the opt-out comment, which is how a gate stops
 * meaning anything (#4376 hit this).
 *
 * The simplest portable check: match the basename (without `.ts`) +
 * `.js` suffix as the tail of a quoted import path. Greedy by design —
 * collisions on common names (`index.js`, `types.js`) are possible
 * but the gate is advisory + opt-out-able, so a small false-positive
 * rate is acceptable.
 */
export function importSpecifierPatterns(file: string): RegExp[] {
  const base = basename(file).replace(/\.tsx?$/, '');
  // Escape regex metachars in `base` even though file basenames don't
  // usually contain them — defensive against e.g. `+`-suffixed names.
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tail = `['"][^'"]*\\/${escaped}\\.js['"]`;
  return [
    new RegExp(`from\\s+${tail}`),
    // `import('...')` / `await import('...')`, and `require('...')` for the
    // handful of CJS interop sites.
    new RegExp(`\\bimport\\s*\\(\\s*${tail}`),
    new RegExp(`\\brequire\\s*\\(\\s*${tail}`),
  ];
}

/**
 * Recursively walk `dir` and return every `.ts` / `.tsx` file path. Pure
 * Node — no `rg` / `find` shell-out, so the check works identically on
 * developer machines and CI runners where ripgrep may not be on PATH.
 */
function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        out.push(...listSourceFiles(p));
      } else if (st.isFile() && /\.tsx?$/.test(entry) && !entry.endsWith('.d.ts')) {
        out.push(p);
      }
    }
  } catch {
    // Unreadable dir — skip silently; this is an advisory check.
  }
  return out;
}

/** Cache the file list across multiple `findConsumers` calls within one run. */
let allSourceFilesCache: string[] | undefined;
function getAllSourceFiles(): string[] {
  allSourceFilesCache ??= listSourceFiles(SRC_DIR);
  return allSourceFilesCache;
}

/**
 * True for test-support modules — helpers under `src/testing/` whose whole
 * reason to exist is to be imported by tests.
 *
 * They still need a consumer, so dead code there is caught exactly as before;
 * the only relaxation is that a *test* consumer counts. Without this, the sole
 * way to add a test helper is the `@export-no-consumer-yet` marker, which
 * promises a production consumer that is never coming — a lie the gate would
 * then carry indefinitely. Note `src/testing/` also holds genuinely
 * production-consumed modules (memory-benchmark, e2e scenario runner), which
 * is why this relaxes the *kind* of consumer required rather than skipping
 * the directory.
 */
export function isTestSupportFile(file: string): boolean {
  return file.includes('/src/testing/');
}

/**
 * Patterns matching a build-config *path reference* to `file` (#4633).
 *
 * Vitest names a module by path rather than importing it — `globalSetup`,
 * `setupFiles`, `globalTeardown` are all `['./src/…/x.ts']`. The import-shaped
 * patterns cannot see that, so a fully wired hook looked exactly like a dead
 * file, and the only way past the gate was `@export-no-consumer-yet` — a
 * marker asserting that a production consumer is still to come, when one
 * already existed. An opt-out that requires a false statement is not an
 * opt-out; it is the gate teaching people to lie to it.
 *
 * Deliberately narrower than a bare substring match: the reference must be
 * quoted and end in the module's own basename, so a prose mention of the path
 * in a comment does not silently satisfy the gate. Applied ONLY to config
 * files ({@link packageConfigFiles}), never to the source scan, so ordinary
 * source files still need a real import.
 */
export function configPathPatterns(file: string): RegExp[] {
  const base = basename(file).replace(/\.tsx?$/, '');
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [new RegExp(`['"][^'"]*\\/${escaped}\\.(?:js|ts)['"]`)];
}

/**
 * Build/test config files at the package root, scanned as consumer candidates.
 *
 * These live outside `SRC_DIR`, so the source walk never sees them, yet a
 * module they reference by path is as consumed as one that is imported.
 */
function packageConfigFiles(): string[] {
  const pkgRoot = dirname(SRC_DIR);
  let entries: string[];
  try {
    entries = readdirSync(pkgRoot);
  } catch {
    return [];
  }
  return entries
    .filter((e) => /\.config\.tsx?$/.test(e))
    .map((e) => join(pkgRoot, e))
    .filter((p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    });
}

/**
 * Returns the set of `.ts` files under `SRC_DIR` that contain at least
 * one import matching `patterns`. Excludes the candidate file itself
 * (so a file importing its own siblings doesn't self-consume) and
 * excludes test files (we want production consumers, not just tests) —
 * unless the target is a test-support module, where tests are the
 * intended consumers.
 *
 * Native Node implementation — replaces the earlier `rg`-based check
 * that silently degraded to "no consumers found" on CI runners where
 * ripgrep wasn't on PATH (#3024 regression discovered on PR #3048).
 */
function findConsumers(file: string, patterns: RegExp[]): string[] {
  const consumers = new Set<string>();
  const testConsumersCount = isTestSupportFile(file);
  for (const candidate of getAllSourceFiles()) {
    if (candidate === file) continue;
    if (!testConsumersCount && isTestFile(candidate)) continue;
    let content: string;
    try {
      content = readFileSync(candidate, 'utf-8');
    } catch {
      continue;
    }
    if (patterns.some((re) => re.test(content))) {
      consumers.add(candidate);
    }
  }

  // A module named by path in a build config is consumed just as surely as an
  // imported one — see configPathPatterns.
  const configPatterns = configPathPatterns(file);
  for (const config of packageConfigFiles()) {
    let content: string;
    try {
      content = readFileSync(config, 'utf-8');
    } catch {
      continue;
    }
    if (configPatterns.some((re) => re.test(content))) {
      consumers.add(config);
    }
  }
  return [...consumers];
}

/**
 * Exported declaration names in a source text (#4560).
 *
 * Regex-level, matching the import-detection heuristic already used here.
 * Deliberately not an AST pass: the file-level check has always been greedy
 * and opt-out-able, and a heavier analysis would not change which cases this
 * ratchet blocks on — only how many pre-existing ones it can list.
 */
export function exportedNames(source: string): string[] {
  const names = new Set<string>();
  const decl =
    /^export\s+(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of source.matchAll(decl)) {
    if (m[1] !== undefined) names.add(m[1]);
  }
  return [...names];
}

/**
 * Is `name` referenced by any production file other than the one declaring it?
 *
 * Barrels COUNT here, unlike the file-level check. A re-export is how most
 * callers reach a symbol, and excluding barrels made 2,509 of ~2,700 exports
 * look dead — measured, not assumed.
 */
export function nameHasProductionUse(
  name: string,
  declaringFile: string,
  productionFiles: readonly string[],
  read: (f: string) => string
): boolean {
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  return productionFiles.some((f) => f !== declaringFile && re.test(read(f)));
}

/** True when the file opts out of the gate via the marker comment. */
function hasOptOutMarker(file: string): boolean {
  return OPT_OUT_MARKER.test(safeRead(file));
}

/** An export with no production consumer, and whether this PR introduced it. */
export interface DeadExport {
  readonly file: string;
  readonly name: string;
}

export interface CheckResult {
  /** New source files that have no production consumer. */
  unconsumed: string[];
  /**
   * Exports this PR ADDED that nothing consumes (#4560). Blocking: the author
   * wrote them in this change, so the finding is actionable and near-zero
   * false-positive.
   */
  newDeadExports: DeadExport[];
  /**
   * Exports that were ALREADY dead in a file this PR touched. Advisory only.
   *
   * Measured before choosing: blocking on these flagged 14 exports on a real
   * two-file merge, because touching a file surfaces every pre-existing dead
   * export in it. A gate that punishes an unrelated PR for old debt teaches
   * people to reach for the opt-out marker, which is how a gate stops meaning
   * anything.
   */
  preexistingDeadExports: DeadExport[];
  /** New source files that opted out via the marker. */
  optedOut: string[];
  /** New source files with at least one production consumer. */
  consumed: { file: string; consumers: string[] }[];
  /** Files skipped (tests, barrels, declarations). */
  skipped: string[];
}

/**
 * Classify dead exports in a MODIFIED file as newly-added or pre-existing.
 *
 * `baseSource` is the file as it was at the merge base; `headSource` is now.
 * A name absent from base and dead at head is this PR's doing.
 */
export function classifyDeadExports(
  file: string,
  baseSource: string,
  headSource: string,
  isDead: (name: string) => boolean
): { newDead: DeadExport[]; preexistingDead: DeadExport[] } {
  const before = new Set(exportedNames(baseSource));
  const newDead: DeadExport[] = [];
  const preexistingDead: DeadExport[] = [];

  for (const name of exportedNames(headSource)) {
    if (!isDead(name)) continue;
    (before.has(name) ? preexistingDead : newDead).push({ file, name });
  }
  return { newDead, preexistingDead };
}

/** Run the producer-without-consumer check across the PR's added files. */
export function checkAddedFiles(files: string[]): CheckResult {
  const { newSourceFiles, skipped } = classifyAddedFiles(files);
  const unconsumed: string[] = [];
  const optedOut: string[] = [];
  const consumed: { file: string; consumers: string[] }[] = [];

  for (const file of newSourceFiles) {
    if (hasOptOutMarker(file)) {
      optedOut.push(file);
      continue;
    }
    const patterns = importSpecifierPatterns(file);
    const consumers = findConsumers(file, patterns);
    if (consumers.length === 0) {
      unconsumed.push(file);
    } else {
      consumed.push({ file, consumers });
    }
  }
  return {
    unconsumed,
    optedOut,
    consumed,
    skipped,
    newDeadExports: [],
    preexistingDeadExports: [],
  };
}

/** Log the success-path summary lines (consumed / opted-out / skipped). */
function logSummary(result: CheckResult): void {
  if (result.consumed.length > 0) {
    console.log(
      `Producer/consumer check: ${String(result.consumed.length)} new file(s) have production consumers — OK.`
    );
  }
  if (result.optedOut.length > 0) {
    console.log(
      `Producer/consumer check: ${String(result.optedOut.length)} new file(s) opted out via @export-no-consumer-yet:`
    );
    for (const f of result.optedOut) console.log(`  - ${f}`);
  }
  if (result.skipped.length > 0) {
    console.log(
      `Producer/consumer check: ${String(result.skipped.length)} added file(s) skipped (tests/barrels/declarations).`
    );
  }
}

/** Log the failure-path message when unconsumed files are detected. */
function logFailure(unconsumed: string[]): void {
  console.error('');
  console.error('Producer-without-consumer detected (#3024):');
  console.error(
    `This PR adds ${String(unconsumed.length)} new source file(s) in ${SRC_DIR}` +
      ' with no production consumer:'
  );
  for (const f of unconsumed) console.error(`  - ${f}`);
  console.error('');
  console.error('Each new producer must have at least one non-test, non-barrel import');
  console.error('elsewhere under packages/nexus-agents/src/ — or it joins the ~5,250 LOC');
  console.error('of dead exports the 2026-05-24 audit sweep just deleted (#2937, #2938,');
  console.error('#2939, #2940, #3018, #3022).');
  console.error('');
  console.error('Options:');
  console.error('  1. Wire up the consumer in this PR.');
  console.error(
    '  2. Add `// @export-no-consumer-yet — see #<issue>` to the file with a tracking issue.'
  );
  console.error('  3. Delete the file if the consumer is no longer needed.');
}

/** Files MODIFIED (not added) since `base`, filtered to production source. */
function modifiedSourceFiles(base: string): string[] {
  const out = execSync(`git diff --name-status --diff-filter=M ${base}...HEAD`, {
    encoding: 'utf-8',
  });
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.split(/\s+/).slice(1).join(' '))
    .filter(
      (f) =>
        f.startsWith('packages/nexus-agents/src/') &&
        /\.tsx?$/.test(f) &&
        !isTestSupportFile(f) &&
        !/\/index\.tsx?$/.test(f) &&
        !f.endsWith('.d.ts')
    );
}

/** Every production source file, used as the haystack for name references. */
function productionSourceFiles(): string[] {
  // isTestFile, NOT isTestSupportFile — the latter means "lives in src/testing/",
  // a different concept. Using it here let a test-only import count as
  // production use, which is precisely the blindness that disqualified knip
  // for this job. Caught by running the ratchet against a known-dead export
  // and getting no advisory line.
  return listSourceFiles(SRC_DIR).filter((f) => !isTestFile(f));
}

/**
 * Export-level ratchet over MODIFIED files (#4560).
 *
 * Blocks only on exports this PR added, and merely reports ones already dead
 * in a file it touched. That split is measured, not stylistic: blocking on
 * pre-existing dead exports flagged 14 on a real two-file merge, and a gate
 * that bills an unrelated PR for old debt gets routed around.
 */
function checkModifiedFiles(base: string): {
  newDead: DeadExport[];
  preexisting: DeadExport[];
} {
  const modified = modifiedSourceFiles(base);
  if (modified.length === 0) return { newDead: [], preexisting: [] };

  const production = productionSourceFiles();
  const cache = new Map<string, string>();
  const read = (f: string): string => {
    const hit = cache.get(f);
    if (hit !== undefined) return hit;
    const body = safeRead(f);
    cache.set(f, body);
    return body;
  };

  const newDead: DeadExport[] = [];
  const preexisting: DeadExport[] = [];

  for (const rel of modified) {
    const abs = rel;
    if (hasOptOutMarker(abs)) continue;

    let baseSource = '';
    try {
      baseSource = execSync(`git show ${base}:${rel}`, { encoding: 'utf-8' });
    } catch {
      // Absent at base (renamed, or the ref is shallow): treat every export as
      // pre-existing rather than blaming this PR for code it may not have added.
      baseSource = safeRead(abs);
    }

    const classified = classifyDeadExports(
      rel,
      baseSource,
      safeRead(abs),
      (name) => !nameHasProductionUse(name, abs, production, read)
    );
    newDead.push(...classified.newDead);
    preexisting.push(...classified.preexistingDead);
  }
  return { newDead, preexisting };
}

/** Print the export ratchet's two lists, blocking one and advisory one. */
function reportExportRatchet(ratchet: { newDead: DeadExport[]; preexisting: DeadExport[] }): void {
  if (ratchet.preexisting.length > 0) {
    console.log(
      `\nAlready-dead exports in files this PR touched (${String(ratchet.preexisting.length)}, advisory):`
    );
    for (const d of ratchet.preexisting) console.log(`  - ${d.file} :: ${d.name}`);
    console.log('  Not blocking — this PR did not add them. Removing one is a welcome cleanup.');
  }

  if (ratchet.newDead.length === 0) return;

  console.error(
    `\nExports added by this PR with no production consumer (${String(ratchet.newDead.length)}):`
  );
  for (const d of ratchet.newDead) console.error(`  ✗ ${d.file} :: ${d.name}`);
  console.error(
    '\nA test importing it is not a consumer. Wire it up, or add the\n' +
      '`@export-no-consumer-yet — see #<issue>` marker with a tracking issue.'
  );
}

/**
 * Resolve the ref CI hands us to the merge-base with HEAD (#5671). The file
 * lists use the three-dot diff (`base...HEAD`), which is already relative to
 * the merge-base, but `git show base:file` reads the ref's TIP — so a deletion
 * landed on main after the branch point read as an export this PR added.
 * One SHA for both halves of the comparison.
 */
export function resolveComparisonBase(ref: string, exec: (cmd: string) => string = run): string {
  return exec(`git merge-base ${ref} HEAD`).trim();
}

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8' });
}

function main(): number {
  const ref = process.argv[2] ?? 'origin/main';
  let base: string;
  let files: string[];
  try {
    base = resolveComparisonBase(ref);
    files = addedFiles(base);
  } catch (err) {
    // A git-diff failure (shallow clone, missing ref) must not block CI —
    // the gate is advisory infrastructure, not a correctness check.
    console.warn(
      `check-new-unused-exports: could not diff against ${ref} — ` +
        `${err instanceof Error ? err.message : String(err)}. Skipping.`
    );
    return 0;
  }

  const result = checkAddedFiles(files);
  logSummary(result);

  let exportRatchet = { newDead: [] as DeadExport[], preexisting: [] as DeadExport[] };
  try {
    exportRatchet = checkModifiedFiles(base);
  } catch (err) {
    console.warn(
      'check-new-unused-exports: export ratchet skipped — ' +
        (err instanceof Error ? err.message : String(err))
    );
  }

  reportExportRatchet(exportRatchet);

  if (result.unconsumed.length > 0) {
    logFailure(result.unconsumed);
    return 1;
  }
  return exportRatchet.newDead.length > 0 ? 1 : 0;
}

// Guard the CLI so the test file can import the check functions without a run.
if (process.argv[1]?.endsWith('check-new-unused-exports.ts') === true) {
  process.exit(main());
}
