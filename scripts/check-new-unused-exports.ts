#!/usr/bin/env npx tsx
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
 *   npx tsx scripts/check-new-unused-exports.ts [base-ref]
 *   (base defaults to origin/main)
 *
 * @module scripts/check-new-unused-exports
 * (Source: #3024 — lessons from 7-issue YAGNI sweep)
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

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
 * The simplest portable check: match the basename (without `.ts`) +
 * `.js` suffix as the tail of a quoted import path. Greedy by design —
 * collisions on common names (`index.js`, `types.js`) are possible
 * but the gate is advisory + opt-out-able, so a small false-positive
 * rate is acceptable.
 */
function importSpecifierPatterns(file: string): RegExp[] {
  const base = basename(file).replace(/\.tsx?$/, '');
  // Escape regex metachars in `base` even though file basenames don't
  // usually contain them — defensive against e.g. `+`-suffixed names.
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [new RegExp(`from\\s+['"][^'"]*\\/${escaped}\\.js['"]`)];
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
  return [...consumers];
}

/** True when the file opts out of the gate via the marker comment. */
function hasOptOutMarker(file: string): boolean {
  return OPT_OUT_MARKER.test(safeRead(file));
}

export interface CheckResult {
  /** New source files that have no production consumer. */
  unconsumed: string[];
  /** New source files that opted out via the marker. */
  optedOut: string[];
  /** New source files with at least one production consumer. */
  consumed: { file: string; consumers: string[] }[];
  /** Files skipped (tests, barrels, declarations). */
  skipped: string[];
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
  return { unconsumed, optedOut, consumed, skipped };
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

function main(): number {
  const base = process.argv[2] ?? 'origin/main';
  let files: string[];
  try {
    files = addedFiles(base);
  } catch (err) {
    // A git-diff failure (shallow clone, missing ref) must not block CI —
    // the gate is advisory infrastructure, not a correctness check.
    console.warn(
      `check-new-unused-exports: could not diff against ${base} — ` +
        `${err instanceof Error ? err.message : String(err)}. Skipping.`
    );
    return 0;
  }

  const result = checkAddedFiles(files);
  logSummary(result);
  if (result.unconsumed.length === 0) return 0;
  logFailure(result.unconsumed);
  return 1;
}

// Guard the CLI so the test file can import the check functions without a run.
if (process.argv[1]?.endsWith('check-new-unused-exports.ts') === true) {
  process.exit(main());
}
