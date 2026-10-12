/**
 * Loader for the models.dev snapshot (#2547 4b).
 *
 * The committed snapshot at `./models-dev-snapshot.json` is generated
 * by `scripts/sync-models-dev.ts` and shipped with the package. This
 * loader reads it at registry construction so models the in-tree
 * authoritative list doesn't know about still get pricing / context /
 * modality data from models.dev as a tier-3 fallback.
 *
 * Resolution chain (most specific first):
 *   1. operator manifest overlay   (tier 1; #2547 4a)
 *   2. in-tree authoritative       (tier 2)
 *   3. models.dev snapshot         (this file; tier 3)
 *   4. derived from vendor+family  (tier 4)
 *   5. universal default           (tier 5)
 *
 * Like the manifest loader, this never throws — a missing or malformed
 * snapshot returns an empty entry list with a warn log.
 *
 * @module config/models-dev-snapshot-loader
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createLogger } from '../core/logger.js';
import type { ModelEntry } from './model-registry.js';

// Path resolution: try the source-tree location first (development);
// fall back to a sibling of this file (built dist). Both paths
// shouldn't exist simultaneously, so the first hit wins.
function defaultSnapshotPath(): string {
  // import.meta.url points at the .ts source in dev (via tsx), or at
  // the compiled .js in dist. The snapshot lives next to either.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, 'models-dev-snapshot.json');
}

export interface ModelsDevSnapshot {
  readonly version: 1;
  readonly fetchedAt: string;
  readonly sourceUrl: string;
  readonly entries: readonly ModelEntry[];
  readonly gatewaysByModel?: Readonly<Record<string, readonly string[]>>;
}

interface SnapshotShape {
  version: number;
  fetchedAt?: string;
  sourceUrl?: string;
  entries?: unknown[];
  gatewaysByModel?: Record<string, readonly string[]>;
}

export interface ModelsDevSnapshotLoadResult {
  readonly entries: readonly ModelEntry[];
  readonly path: string;
  readonly status: 'missing' | 'malformed' | 'loaded';
  readonly fetchedAt?: string;
  readonly gatewaysByModel?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Drop pricing that is present but not numeric, keeping the entry.
 *
 * Strips the RATES rather than the model, mirroring
 * `models-generated-loader`'s `return undefined` for pricing alone: an entry
 * with a corrupt rate becomes an honestly UNPRICED model, which the cost chain
 * already represents via `priced: false`. Dropping the entry would silently
 * shrink the catalog instead — 15 of the 353 committed entries carry no pricing
 * at all, so absent pricing is a normal state, not a corruption signal.
 */
function stripMalformedPricing(
  entries: readonly ModelEntry[],
  logger: ReturnType<typeof createLogger>,
  path: string
): ModelEntry[] {
  let strippedPricing = 0;
  const out = entries.map((entry) => {
    const pricing = entry.pricing;
    if (pricing === undefined) return entry;
    if (typeof pricing.inputPer1M === 'number' && typeof pricing.outputPer1M === 'number') {
      return entry;
    }
    strippedPricing++;
    const withoutPricing: ModelEntry = { ...entry };
    delete (withoutPricing as { pricing?: unknown }).pricing;
    return withoutPricing;
  });
  if (strippedPricing > 0) {
    logger.warn('models.dev snapshot entries had non-numeric pricing; treated as unpriced', {
      path,
      strippedPricing,
    });
  }
  return out;
}

function parseSnapshotFile(
  path: string,
  logger: ReturnType<typeof createLogger>
): SnapshotShape | 'missing' | 'malformed' {
  try {
    if (!existsSync(path)) return 'missing';
  } catch {
    return 'missing';
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as SnapshotShape;
    if (parsed.version !== 1) {
      logger.warn('models.dev snapshot version unsupported; skipping', {
        path,
        version: parsed.version,
      });
      return 'malformed';
    }
    if (!Array.isArray(parsed.entries)) {
      logger.warn('models.dev snapshot missing entries array; skipping', { path });
      return 'malformed';
    }
    return parsed;
  } catch (e: unknown) {
    logger.warn('models.dev snapshot parse failure; skipping', {
      path,
      error: e instanceof Error ? e.message : String(e),
    });
    return 'malformed';
  }
}

export function loadModelsDevSnapshot(options?: {
  readonly path?: string;
}): ModelsDevSnapshotLoadResult {
  const logger = createLogger({ component: 'models-dev-snapshot' });
  const path = options?.path ?? defaultSnapshotPath();

  const parsed = parseSnapshotFile(path, logger);
  if (typeof parsed === 'string') {
    return { entries: [], path, status: parsed };
  }

  const entries = stripMalformedPricing(parsed.entries as ModelEntry[], logger, path);

  return {
    entries,
    path,
    status: 'loaded',
    ...(typeof parsed.fetchedAt === 'string' ? { fetchedAt: parsed.fetchedAt } : {}),
    ...(parsed.gatewaysByModel !== undefined ? { gatewaysByModel: parsed.gatewaysByModel } : {}),
  };
}
