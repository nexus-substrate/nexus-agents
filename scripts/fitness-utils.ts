/**
 * Utility functions for fitness score assessment.
 * @module scripts/fitness-utils
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Count files matching a pattern in a directory recursively.
 */
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

/**
 * Check if a file contains a pattern.
 */
export function fileContains(filePath: string, pattern: RegExp): boolean {
  if (!existsSync(filePath)) return false;
  return pattern.test(readFileSync(filePath, 'utf-8'));
}

/**
 * Check if entry matches any exclude pattern.
 */
export function isExcluded(entry: string, excludePatterns: RegExp[] | undefined): boolean {
  return excludePatterns?.some((p) => p.test(entry)) ?? false;
}

/**
 * Count pattern occurrences in directory files.
 */
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
      const matches = readFileSync(fullPath, 'utf-8').match(contentPattern);
      count += matches?.length ?? 0;
    }
  }
  return count;
}

export interface FitnessComponent {
  readonly name: string;
  readonly score: number;
  readonly maxScore: number;
  readonly details: string[];
  readonly penalties: string[];
  readonly rewards: string[];
}

export interface FitnessResult {
  readonly total: number;
  readonly maxTotal: number;
  readonly percentage: number;
  readonly components: FitnessComponent[];
  readonly trend: 'improving' | 'stable' | 'declining';
  readonly assessmentDate: string;
}
