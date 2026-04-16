/**
 * Negative results enforcement.
 *
 * Checks if a technique has been previously rejected to prevent
 * re-researching failed approaches.
 *
 * @module research/negative-results
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'yaml';
import { createLogger, getErrorMessage } from '../core/index.js';

const logger = createLogger({ component: 'negative-results' });

interface NegativeResult {
  name: string;
  paper: string;
  rejection_date: string;
  failure_mode: string;
  lessons_learned: string[];
  reopen_conditions: string[];
}

interface NegativeResultsRegistry {
  negative_results: Record<string, NegativeResult>;
}

const REGISTRY_PATH = resolve('docs/research/registry/negative-results.yaml');

let cachedResults: NegativeResultsRegistry | undefined;

function loadNegativeResults(): NegativeResultsRegistry {
  if (cachedResults !== undefined) return cachedResults;
  try {
    const content = readFileSync(REGISTRY_PATH, 'utf-8');
    cachedResults = yaml.parse(content) as NegativeResultsRegistry;
    return cachedResults;
  } catch (error: unknown) {
    logger.debug('Could not load negative-results registry', {
      path: REGISTRY_PATH,
      error: getErrorMessage(error),
    });
    return { negative_results: {} };
  }
}

/**
 * Check if a technique has been rejected.
 * Returns the rejection details if found, undefined otherwise.
 */
export function checkRejected(techniqueId: string): NegativeResult | undefined {
  const registry = loadNegativeResults();
  return registry.negative_results[techniqueId];
}

/**
 * Get all rejected technique IDs.
 */
export function getRejectedIds(): string[] {
  const registry = loadNegativeResults();
  return Object.keys(registry.negative_results);
}

/**
 * Format a rejection warning for display.
 */
export function formatRejectionWarning(id: string, result: NegativeResult): string {
  return [
    `⚠️ REJECTED TECHNIQUE: ${result.name}`,
    `Failure mode: ${result.failure_mode}`,
    `Paper: ${result.paper}`,
    `Rejected: ${result.rejection_date}`,
    '',
    'Lessons learned:',
    ...result.lessons_learned.map((l: string) => `  - ${l}`),
    '',
    'Reopen conditions:',
    ...result.reopen_conditions.map((c: string) => `  - ${c}`),
  ].join('\n');
}

/** Reset cache (for testing). */
export function resetNegativeResultsCache(): void {
  cachedResults = undefined;
}
