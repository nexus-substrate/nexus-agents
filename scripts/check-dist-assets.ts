#!/usr/bin/env npx tsx
/**
 * Verify every runtime-read data asset actually reached `dist/` (#5083).
 *
 * Some loaders read a data file as a SIBLING of their own compiled module —
 * `join(dirname(fileURLToPath(import.meta.url)), 'x.json')`. tsup bundles code,
 * not data, so those files are copied in `onSuccess`. A copy that is missing,
 * or silently swallowed with `|| true`, ships a package whose loader falls back
 * to empty.
 *
 * `models-dev-snapshot.json` was never in the copy list at all. Because
 * `package.json#files` ships only `dist`, no installed copy has ever contained
 * it: every `claude` / `codex` / `gemini` model enumeration returned `[]`,
 * while dev — running from `src/config/` via tsx — returned 13 / 47 / 82. The
 * two transports that do not use the snapshot (`opencode`, native probe; and
 * OpenRouter, network) kept working and masked it.
 *
 * The loaders all catch and fall back to `[]`, so nothing was ever red. This
 * check is what makes the omission fail the build instead.
 *
 * @module scripts/check-dist-assets
 * (Source: Issue #5083)
 */
import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { ROOT } from './script-paths.js';

const DIST = join(ROOT, 'packages/nexus-agents/dist');
const SRC = join(ROOT, 'packages/nexus-agents/src');

/**
 * Assets a runtime loader reads from `dist/`, with the smallest size that
 * indicates real content.
 *
 * The size floor matters: `cp` of a truncated or half-written file leaves a
 * path that `existsSync` accepts, and an empty JSON array parses fine and
 * enumerates to nothing — which is the failure this check exists to catch,
 * one step further along.
 */
export const REQUIRED_DIST_ASSETS: ReadonlyArray<{
  readonly file: string;
  readonly minBytes: number;
}> = [
  { file: 'models-dev-snapshot.json', minBytes: 50_000 },
  { file: 'model-registry.generated.json', minBytes: 1_000 },
  { file: 'workflows/templates', minBytes: 1 },
  { file: 'security/ast-rules', minBytes: 1 },
];

/**
 * Assets missing or truncated under `distDir`. Pure and directory-injected so
 * the empty and truncated cases are testable without a build.
 */
export function missingDistAssets(distDir: string): string[] {
  const problems: string[] = [];
  for (const { file, minBytes } of REQUIRED_DIST_ASSETS) {
    const path = join(distDir, file);
    if (!existsSync(path)) {
      problems.push(`${file}: MISSING from dist/`);
      continue;
    }
    const stat = statSync(path);
    if (stat.isDirectory()) continue;
    if (stat.size < minBytes) {
      problems.push(`${file}: ${String(stat.size)} bytes, below the ${String(minBytes)} floor`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Completeness: the list above must not go stale (#5143)
// ---------------------------------------------------------------------------

/**
 * Runtime files that resolve a path RELATIVE TO THEIR OWN MODULE, and what each
 * needs from `dist/`.
 *
 * `REQUIRED_DIST_ASSETS` is hand-maintained, so on its own it guards the assets
 * somebody remembered to list. That is the #5084 shape one step removed: add a
 * loader, forget the entry, and the gate stays green while every installed copy
 * reads a file that was never shipped.
 *
 * This map closes that. A file that computes a path from `import.meta.url` or
 * `__dirname` is resolving INSIDE THE INSTALLED PACKAGE, so it either needs a
 * shipped asset — named here and cross-checked against the list above — or it
 * is doing something else and says so. A new one fails the check until declared,
 * which forces the author to answer "does this need to ship?" exactly once.
 *
 * Keyed on the FILE, not on an extracted asset string: the four real loaders
 * resolve their assets four different ways (`join(here, 'x.json')`,
 * `join(distDir, 'workflows', 'templates')`, and so on), and a regex over those
 * shapes would be the false-positive treadmill rather than a check.
 */
export const MODULE_RELATIVE_RESOLVERS: Readonly<Record<string, string | null>> = {
  // Asset-reading: the value must appear in REQUIRED_DIST_ASSETS.
  'config/models-dev-snapshot-loader.ts': 'models-dev-snapshot.json',
  'config/models-generated-loader.ts': 'model-registry.generated.json',
  'workflows/template-loader.ts': 'workflows/templates',
  'security/ast-rule-runner.ts': 'security/ast-rules',

  // `null` = resolves a module-relative path but reads no shipped asset.
  // Each still has to be listed, so the next addition is a deliberate answer.
  'cli-adapters/child-mcp-config.ts': null, // resolves dist/cli.js, produced by tsup itself
  'cli/visualize-summary.ts': null, // module-relative path, no asset read
  'testing/test-scratch-root.ts': null, // scratch dir for tests, never shipped
};

/** Files under `src/` that resolve a path relative to their own module. */
export function findModuleRelativeResolvers(srcRoot: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts')) continue;
      if (entry.includes('.test.') || entry.includes('.spec.')) continue;
      const src = readFileSync(full, 'utf8');
      if (/fileURLToPath\(import\.meta\.url\)|\b__dirname\b/.test(src)) {
        out.push(relative(srcRoot, full));
      }
    }
  };
  walk(srcRoot);
  return out.sort();
}

export interface CompletenessProblem {
  readonly file: string;
  readonly problem: string;
}

/**
 * Two failure modes, both real:
 *  1. A resolver exists that nothing declared — the #5084 shape.
 *  2. A declared resolver names an asset absent from REQUIRED_DIST_ASSETS, so
 *     the asset it depends on is unguarded.
 *
 * A declaration for a file that no longer resolves module-relatively is also
 * reported, so the map shrinks as code changes instead of only growing.
 */
export function assetListCompleteness(
  resolvers: readonly string[],
  declared: Readonly<Record<string, string | null>> = MODULE_RELATIVE_RESOLVERS,
  guarded: readonly string[] = REQUIRED_DIST_ASSETS.map((a) => a.file)
): CompletenessProblem[] {
  const problems: CompletenessProblem[] = [];
  const guardedSet = new Set(guarded);

  for (const file of resolvers) {
    if (!(file in declared)) {
      problems.push({
        file,
        problem:
          'resolves a path relative to its own module but is not declared. If it reads a ' +
          'shipped asset, name that asset (and add it to REQUIRED_DIST_ASSETS); if not, ' +
          'declare it as null with a reason.',
      });
      continue;
    }
    const asset = declared[file];
    if (asset !== null && asset !== undefined && !guardedSet.has(asset)) {
      problems.push({
        file,
        problem: `needs "${asset}", which is not in REQUIRED_DIST_ASSETS — it ships unguarded.`,
      });
    }
  }

  const seen = new Set(resolvers);
  for (const file of Object.keys(declared)) {
    if (!seen.has(file)) {
      problems.push({
        file,
        problem: 'declared but no longer resolves module-relatively — remove it.',
      });
    }
  }

  return problems;
}

/* eslint-disable no-console */
function main(): void {
  if (!existsSync(DIST)) {
    console.error(`::error::dist/ not found at ${DIST} — run the build first.`);
    process.exitCode = 1;
    return;
  }

  const completeness = assetListCompleteness(findModuleRelativeResolvers(SRC));
  if (completeness.length > 0) {
    console.error('::error::The dist-asset list has gone stale — a runtime file resolves a');
    console.error('module-relative path that nothing declares. That is how #5084 happened.');
    for (const c of completeness) console.error(`  - ${c.file}: ${c.problem}`);
    process.exitCode = 1;
    return;
  }

  const problems = missingDistAssets(DIST);

  if (problems.length > 0) {
    console.error('::error::Runtime assets missing from dist/ — the published package would ship');
    console.error('a loader that silently falls back to empty. Check tsup.config.ts `onSuccess`.');
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `dist assets OK (${String(REQUIRED_DIST_ASSETS.length)} checked, ` +
      `${String(Object.keys(MODULE_RELATIVE_RESOLVERS).length)} resolvers declared).`
  );
}

if (process.argv[1]?.endsWith('check-dist-assets.ts') === true) {
  main();
}
