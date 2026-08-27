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
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './script-paths.js';

const DIST = join(ROOT, 'packages/nexus-agents/dist');

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

/* eslint-disable no-console */
function main(): void {
  if (!existsSync(DIST)) {
    console.error(`::error::dist/ not found at ${DIST} — run the build first.`);
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

  console.log(`dist assets OK (${String(REQUIRED_DIST_ASSETS.length)} checked).`);
}

if (process.argv[1]?.endsWith('check-dist-assets.ts') === true) {
  main();
}
