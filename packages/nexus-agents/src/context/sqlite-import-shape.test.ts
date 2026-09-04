/**
 * `node:sqlite` must never be imported STATICALLY as a value (#5392).
 *
 * This pins a bundling property that no ordinary unit test can see, and the
 * absence of it is how #5388 shipped a warning filter that could never fire.
 *
 * The chain:
 *
 * 1. Node emits the SQLite `ExperimentalWarning` at IMPORT time, not first use.
 * 2. The bundler HOISTS `import { DatabaseSync } from 'node:sqlite'` to the top
 *    of the emitted chunk, where it evaluates before any code in this package.
 * 3. So the CLI's `process.emitWarning` filter — which works correctly in
 *    isolation, and whose own unit tests passed — ran strictly after the
 *    warning had already been printed.
 *
 * Every test of the filter itself passed while the filter was useless, because
 * each one installed the filter first and then triggered a warning by hand.
 * The property that actually mattered was the IMPORT SHAPE, so that is what is
 * asserted here.
 *
 * `createRequire` keeps the load synchronous — the reason `node:sqlite` was
 * chosen over an async alternative — while deferring it past filter setup.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_ROOT = new URL('..', import.meta.url).pathname;

/**
 * Any static import declaration whose specifier is `node:sqlite`.
 *
 * Matched and classified PER LINE, not per file. The first version of this
 * check tested the whole file for a value import AND the absence of a type
 * import — so a file containing both (which `open-database.ts` legitimately
 * does) reported clean, and a mutation reintroducing the exact bug passed.
 * A guard with the defect it guards against is worse than no guard.
 */
const SQLITE_IMPORT_LINE = /^\s*import\s+(?<kind>type\s+)?[^;]*?from\s+['"]node:sqlite['"]/;

/** Value-level static import lines only — type-only lines are erased pre-bundle. */
function staticValueImportLines(src: string): string[] {
  return src
    .split('\n')
    .filter((line) => {
      const m = SQLITE_IMPORT_LINE.exec(line);
      return m !== null && m.groups?.['kind'] === undefined;
    })
    .map((line) => line.trim());
}

function collectTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsFiles(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('node:sqlite import shape (#5392)', () => {
  const files = collectTsFiles(SRC_ROOT);

  it('finds source files to scan', () => {
    // Guards the guard: an empty file list would make every assertion below
    // pass vacuously, which is the same defect class this test exists for.
    expect(files.length).toBeGreaterThan(100);
  });

  it('no source file imports node:sqlite statically as a value', () => {
    const offenders = files
      .filter((f) => staticValueImportLines(readFileSync(f, 'utf-8')).length > 0)
      .map((f) => relative(SRC_ROOT, f));

    // If this fails, the CLI's ExperimentalWarning filter has silently stopped
    // working: the bundler hoists the import above the filter's installation.
    // Load it through `createRequire` instead (see context/open-database.ts).
    expect(offenders).toEqual([]);
  });

  it('the opener loads node:sqlite through createRequire', () => {
    // The positive control. Without it, deleting `open-database.ts` outright
    // would satisfy the assertion above.
    const opener = readFileSync(join(SRC_ROOT, 'context', 'open-database.ts'), 'utf-8');

    expect(opener).toContain('createRequire');
    expect(opener).toContain("requireFromHere('node:sqlite')");
  });

  it('a type-only import would not trip the check', () => {
    // Documents the boundary being drawn: `import type` is erased before
    // bundling, so it is safe and must not be reported as an offender.
    const typeOnly = "import type { DatabaseSync } from 'node:sqlite';";
    const value = "import { DatabaseSync } from 'node:sqlite';";

    expect(staticValueImportLines(typeOnly)).toEqual([]);
    // And the positive half: a value import in a file that ALSO has a type
    // import must still be reported. This is the case the first version missed.
    expect(staticValueImportLines(`${typeOnly}\n${value}`)).toEqual([value]);
  });
});
