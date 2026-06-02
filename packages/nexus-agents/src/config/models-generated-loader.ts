/**
 * Loader for the bundled generated model registry (#3293).
 *
 * `model-registry.generated.json` is the broad (~1071-entry) LiteLLM/models.dev
 * catalog that the legacy `CapabilityDiscovery` T2 tier resolved against. To
 * complete the CapabilityDiscovery → ModelRegistry consolidation WITHOUT losing
 * that breadth (owner decision: "connect the 1071, don't drop it"), the registry
 * ingests these entries as a LOWEST-priority breadth tier: anything also present
 * in-tree / manifest / models-dev wins; otherwise the registry now has real
 * (litellm-sourced) context-window + pricing for the long tail instead of a bare
 * derived default.
 *
 * Each raw record is converted to a full `ModelEntry` by deriving the behavior
 * fields (`deriveEntry`) from the id's identity, then overlaying the catalog's
 * concrete data (displayName, contextWindow, maxOutputTokens, pricing). The
 * loader is fail-soft: a missing/malformed file yields no entries.
 *
 * @module config/models-generated-loader
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../core/index.js';
import { resolveModelIdentitySync } from './model-identity.js';
import { deriveEntry } from './model-derivation.js';
import type { ModelEntry } from './model-registry.js';

/** Shape of a record in `model-registry.generated.json`'s `entries` array. */
interface GeneratedRecord {
  readonly id?: unknown;
  readonly displayName?: unknown;
  readonly contextWindow?: unknown;
  readonly maxOutputTokens?: unknown;
  readonly pricing?: { readonly inputPer1M?: unknown; readonly outputPer1M?: unknown };
}

interface GeneratedShape {
  readonly version?: unknown;
  readonly entries?: unknown;
}

export interface GeneratedLoadResult {
  readonly entries: readonly ModelEntry[];
  readonly path: string;
  readonly status: 'loaded' | 'missing' | 'malformed';
}

function defaultGeneratedPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, 'model-registry.generated.json');
}

/** Convert one raw catalog record into a `ModelEntry` (derived base + overlay). */
function toModelEntry(rec: GeneratedRecord): ModelEntry | undefined {
  if (typeof rec.id !== 'string' || rec.id === '') return undefined;
  const id = rec.id;
  const base = deriveEntry(id, resolveModelIdentitySync(id));
  const pricing =
    rec.pricing !== undefined &&
    typeof rec.pricing.inputPer1M === 'number' &&
    typeof rec.pricing.outputPer1M === 'number'
      ? { inputPer1M: rec.pricing.inputPer1M, outputPer1M: rec.pricing.outputPer1M }
      : undefined;
  return {
    ...base,
    source: 'generated',
    ...(typeof rec.displayName === 'string' ? { displayName: rec.displayName } : {}),
    ...(typeof rec.contextWindow === 'number' ? { contextWindow: rec.contextWindow } : {}),
    ...(typeof rec.maxOutputTokens === 'number' ? { maxOutputTokens: rec.maxOutputTokens } : {}),
    ...(pricing !== undefined ? { pricing } : {}),
  };
}

/**
 * Load the generated catalog as `ModelEntry[]`. Fail-soft: missing/malformed →
 * empty (logged at warn). Records without a string `id` are skipped.
 */
export function loadGeneratedRegistryEntries(options?: {
  readonly path?: string;
}): GeneratedLoadResult {
  const logger = createLogger({ component: 'models-generated' });
  const path = options?.path ?? defaultGeneratedPath();

  let exists = false;
  try {
    exists = existsSync(path);
  } catch {
    return { entries: [], path, status: 'missing' };
  }
  if (!exists) return { entries: [], path, status: 'missing' };

  let parsed: GeneratedShape;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8')) as GeneratedShape;
  } catch (e: unknown) {
    logger.warn('generated registry parse failure; skipping', {
      path,
      error: e instanceof Error ? e.message : String(e),
    });
    return { entries: [], path, status: 'malformed' };
  }

  if (!Array.isArray(parsed.entries)) {
    logger.warn('generated registry missing entries array; skipping', { path });
    return { entries: [], path, status: 'malformed' };
  }

  const entries: ModelEntry[] = [];
  for (const raw of parsed.entries as readonly GeneratedRecord[]) {
    const entry = toModelEntry(raw);
    if (entry !== undefined) entries.push(entry);
  }
  return { entries, path, status: 'loaded' };
}
