/**
 * Filesystem scanning for the fitness calculator — counting files and pattern
 * occurrences under a source root.
 *
 * Split out of `fitness-score.ts` (#5580) so the counters take the root as a
 * parameter and can be pointed at a fixture tree. The mock-guard counter in
 * particular had a branch that could not be reached while it scanned the live
 * source root: the checker's own file matched the pattern it was looking for.
 * @module governance/source-scan
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const DETERMINISM_EXCLUDES: RegExp[] = [
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /random-provider\.ts$/,
  /time-provider\.ts$/,
];

/**
 * Files that mention `NEXUS_ALLOW_MOCK_ORCHESTRATION` without guarding
 * anything, on top of the determinism excludes (#5580).
 *
 * `fitness-score.ts` is this checker: its own regex, JSDoc and warning text
 * all contain the name, so scanning the whole tree matched itself and
 * `mockGuardCount === 0` could never be true — the "no guard found" warning
 * could not fire even with the guard deleted. `env-schema.ts` registers every
 * NEXUS_* variable and would keep the count non-zero for the same reason.
 *
 * The pattern deliberately stays a name match rather than a `process.env[...]`
 * match: the real guard reads the name through a `MOCK_ORCHESTRATION_ENV`
 * constant, so requiring the literal access shape would stop counting the
 * guard that exists.
 */
const MOCK_GUARD_EXCLUDES: RegExp[] = [
  ...DETERMINISM_EXCLUDES,
  /^fitness-score\.ts$/,
  /^env-schema\.ts$/,
];

/**
 * Counts the sites that name the mock-orchestration opt-in guard, excluding
 * the checker itself and the env schema. Exported so the "no guard" branch can
 * be tested against a fixture tree instead of the live source root (#5580).
 */
export function countMockGuardSites(srcRoot: string): number {
  return countPatternInDir(
    srcRoot,
    /\.ts$/,
    /NEXUS_ALLOW_MOCK_ORCHESTRATION/g,
    MOCK_GUARD_EXCLUDES
  );
}

// =========================================================================
// Filesystem utility methods (inlined from scripts/fitness-utils.ts)
// =========================================================================

export function countFiles(dir: string, pattern: RegExp): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory() && !entry.startsWith('.')) {
      count += countFiles(fullPath, pattern);
    } else if (pattern.test(entry)) {
      count++;
    }
  }
  return count;
}

export function fileContains(filePath: string, pattern: RegExp): boolean {
  if (!existsSync(filePath)) return false;
  return pattern.test(readFileSync(filePath, 'utf-8'));
}

function isExcluded(entry: string, excludePatterns?: RegExp[]): boolean {
  return excludePatterns?.some((p) => p.test(entry)) ?? false;
}

function countMatchesInFile(fullPath: string, contentPattern: RegExp): number {
  const matches = readFileSync(fullPath, 'utf-8').match(contentPattern);
  return matches?.length ?? 0;
}

export function countPatternInDir(
  dir: string,
  filePattern: RegExp,
  contentPattern: RegExp,
  excludePatterns?: RegExp[]
): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
      count += countPatternInDir(fullPath, filePattern, contentPattern, excludePatterns);
    } else if (filePattern.test(entry) && !isExcluded(entry, excludePatterns)) {
      count += countMatchesInFile(fullPath, contentPattern);
    }
  }
  return count;
}
