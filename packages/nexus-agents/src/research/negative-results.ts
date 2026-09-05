/**
 * Negative results enforcement.
 *
 * Checks if a technique has been previously rejected to prevent
 * re-researching failed approaches.
 *
 * @module research/negative-results
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'yaml';
import { z } from 'zod';
import { createLogger, getErrorMessage } from '../core/index.js';
import { REGISTRY_PATH, resolveRegistryRoot } from '../cli/research-helpers-io.js';

const logger = createLogger({ component: 'negative-results' });

const NegativeResultSchema = z.object({
  name: z.string(),
  paper: z.string(),
  rejection_date: z.string(),
  failure_mode: z.string(),
  lessons_learned: z.array(z.string()),
  reopen_conditions: z.array(z.string()),
});

const NegativeResultsRegistrySchema = z.object({
  negative_results: z.record(z.string(), NegativeResultSchema),
});

type NegativeResult = z.infer<typeof NegativeResultSchema>;
type NegativeResultsRegistry = z.infer<typeof NegativeResultsRegistrySchema>;
type NegativeResultsLoadResult =
  | { status: 'loaded'; registry: NegativeResultsRegistry }
  | { status: 'unavailable'; reason: string };

type RejectionCheckResult =
  | { kind: 'rejected'; entry: NegativeResult }
  | { kind: 'not-rejected' }
  | { kind: 'unavailable'; reason: string };

const NEGATIVE_RESULTS_FILE = 'negative-results.yaml';

/**
 * Path of the negative-results registry, derived at call time (#5053) from
 * the same root the other research registries use — never a cwd-relative
 * path fixed at import, which followed wherever the server was started.
 */
function negativeResultsPath(): string {
  return join(resolveRegistryRoot(), REGISTRY_PATH, NEGATIVE_RESULTS_FILE);
}

let cachedResults: NegativeResultsRegistry | undefined;

function unavailableResult(registryPath: string, error: unknown): NegativeResultsLoadResult {
  logger.debug('Could not load negative-results registry', {
    path: registryPath,
    error: getErrorMessage(error),
  });
  return {
    status: 'unavailable',
    reason: 'The negative-results registry could not be read or parsed',
  };
}

function loadNegativeResults(): NegativeResultsLoadResult {
  if (cachedResults !== undefined) return { status: 'loaded', registry: cachedResults };
  const registryPath = negativeResultsPath();
  try {
    const content = readFileSync(registryPath, 'utf-8');
    const parsed = NegativeResultsRegistrySchema.safeParse(yaml.parse(content) as unknown);
    if (!parsed.success) return unavailableResult(registryPath, parsed.error);
    cachedResults = parsed.data;
    return { status: 'loaded', registry: cachedResults };
  } catch (error: unknown) {
    return unavailableResult(registryPath, error);
  }
}

/**
 * Check if a technique has been rejected.
 * Distinguishes a recorded rejection, a measured non-rejection, and an
 * unavailable registry. Unavailable loads are not cached, so the next call
 * retries the file after a transient read or parse failure.
 */
export function checkRejected(techniqueId: string): RejectionCheckResult {
  const loaded = loadNegativeResults();
  if (loaded.status === 'unavailable') {
    return { kind: 'unavailable', reason: loaded.reason };
  }
  const entry = loaded.registry.negative_results[techniqueId];
  return entry === undefined ? { kind: 'not-rejected' } : { kind: 'rejected', entry };
}

/**
 * Get all rejected technique IDs.
 */
export function getRejectedIds(): string[] {
  const loaded = loadNegativeResults();
  if (loaded.status === 'unavailable') return [];
  return Object.keys(loaded.registry.negative_results);
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
