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
import { nexusDataPath } from './nexus-data-dir.js';
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
  // #3707: `registry refresh` writes the regenerated catalog to the DATA dir
  // (nexusDataPath), but this loader historically read only the bundled PACKAGE
  // copy — so a refresh was silently never picked up (even after #3185's
  // reloadDefaultRegistry, which re-reads via this path). Prefer a refreshed file
  // in the data dir when present, falling back to the bundled copy — the same
  // data-dir > package precedence the overlay path already uses. The package dir
  // is also often read-only under a global npm install, so the data dir is the
  // only writable target a refresh has.
  try {
    const dataPath = nexusDataPath('model-registry.generated.json');
    if (existsSync(dataPath)) return dataPath;
  } catch {
    // Fall through to the bundled package copy on any data-dir resolution error.
  }
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, 'model-registry.generated.json');
}

/**
 * Extract usable pricing from a raw catalog record.
 *
 * #4176: litellm carries placeholder $0/$0 rows for models it has no pricing
 * for (e.g. `amazon-bedrock/anthropic.claude-mythos-preview`). Treating that
 * as real pricing makes `computeCostDetail` report priced:true costUsd:0 — a
 * measured $0 for what is actually UNMEASURED (#4165). Drop BOTH-zero pricing
 * so the entry stays unpriced; one-sided zeros (free input tiers) are real
 * and kept. Genuinely free models are represented in-tree (higher tier), so
 * nothing legitimate is lost at this lowest-priority breadth tier.
 */
function extractPricing(
  rec: GeneratedRecord
): { inputPer1M: number; outputPer1M: number } | undefined {
  const inputPer1M = rec.pricing?.inputPer1M;
  const outputPer1M = rec.pricing?.outputPer1M;
  if (typeof inputPer1M !== 'number' || typeof outputPer1M !== 'number') return undefined;
  if (inputPer1M === 0 && outputPer1M === 0) return undefined;
  return { inputPer1M, outputPer1M };
}

/** Convert one raw catalog record into a `ModelEntry` (derived base + overlay). */
function toModelEntry(rec: GeneratedRecord): ModelEntry | undefined {
  if (typeof rec.id !== 'string' || rec.id === '') return undefined;
  const id = rec.id;
  const base = deriveEntry(id, resolveModelIdentitySync(id));
  const pricing = extractPricing(rec);
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
