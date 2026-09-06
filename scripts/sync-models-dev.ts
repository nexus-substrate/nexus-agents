/**
 * models.dev sync script (#2547 4b).
 *
 * Fetches the models.dev catalog as a one-shot snapshot and writes it
 * to `packages/nexus-agents/src/config/models-dev-snapshot.json`. The
 * registry loads the snapshot at boot as tier 3 of the resolution
 * chain (lower priority than in-tree authoritative entries; higher
 * priority than derived fallbacks).
 *
 * Run manually whenever you want to refresh the snapshot. The output
 * is deterministic given the same upstream input — re-running with
 * unchanged input produces no diff.
 *
 * Usage:
 *   pnpm exec tsx scripts/sync-models-dev.ts          # fetch + write
 *   pnpm exec tsx scripts/sync-models-dev.ts --check  # fail if drift exists
 *
 * Design notes:
 *   - No runtime fetch by design. The runtime reads the committed
 *     snapshot; this script is the only thing that talks to models.dev.
 *   - Vendor mapping is intentionally narrow: only providers whose
 *     models map cleanly to nexus-agents' ModelVendor union are kept.
 *     Everything else is dropped (logged at info).
 *   - We DO NOT inflate the snapshot with behaviour fields — the
 *     registry's vendor-default merge fills those in at load time.
 *     The snapshot stays focused on capability + pricing data, which
 *     is what models.dev actually authors.
 */

/* eslint-disable no-console */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './script-paths.js';

import type { ModelEntry } from '../packages/nexus-agents/src/config/model-registry.js';
import type { ModelVendor } from '../packages/nexus-agents/src/config/model-identity.js';

const MODELS_DEV_URL = 'https://models.dev/api.json';
const SNAPSHOT_PATH = join(ROOT, 'packages/nexus-agents/src/config/models-dev-snapshot.json');
const FETCH_TIMEOUT_MS = 20_000;

/**
 * Map models.dev provider keys → nexus-agents `ModelVendor`. Providers
 * not in this map are dropped on purpose — keeping the snapshot narrow
 * avoids overfitting the registry to vendors we don't actually route
 * to. Operators can still add models manually via the manifest overlay
 * (PR #2586) when needed.
 */
const PROVIDER_TO_VENDOR: Record<string, ModelVendor> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google',
  'google-vertex': 'google',
  meta: 'meta',
  mistral: 'mistral',
  cohere: 'cohere',
  deepseek: 'deepseek',
  // Alibaba's Qwen surface — multiple provider keys, one vendor bucket.
  alibaba: 'qwen',
  qwen: 'qwen',
  // NVIDIA's NIM surface
  nvidia: 'nvidia',
};

/**
 * Shape of one model record as returned by models.dev. Captured from
 * `curl https://models.dev/api.json | jq '.anthropic.models[]'` so we
 * pick up only the fields we actually use; new fields don't break us.
 */
interface ModelsDevRecord {
  id: string;
  name?: string;
  family?: string;
  tool_call?: boolean;
  reasoning?: boolean;
  attachment?: boolean;
  modalities?: { input?: string[]; output?: string[] };
  cost?: { input?: number; output?: number; cache_read?: number };
  limit?: { context?: number; output?: number };
  release_date?: string;
  last_updated?: string;
  open_weights?: boolean;
}

interface ModelsDevProvider {
  id?: string;
  name?: string;
  models?: Record<string, ModelsDevRecord>;
}

type ModelsDevCatalog = Record<string, ModelsDevProvider>;

/**
 * Top-level snapshot file format. Versioned so a future format bump
 * doesn't silently mis-parse.
 */
export interface ModelsDevSnapshot {
  readonly version: 1;
  readonly fetchedAt: string; // ISO date
  readonly sourceUrl: string;
  readonly entries: readonly ModelEntry[];
}

async function fetchCatalog(): Promise<ModelsDevCatalog> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(MODELS_DEV_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`models.dev returned HTTP ${String(response.status)}`);
    }
    return (await response.json()) as ModelsDevCatalog;
  } finally {
    clearTimeout(timer);
  }
}

/** Convert a models.dev record into our `ModelEntry` shape. */
function mapRecord(raw: ModelsDevRecord, vendor: ModelVendor): ModelEntry | null {
  if (typeof raw.id !== 'string' || raw.id.length === 0) return null;
  const family = typeof raw.family === 'string' && raw.family.length > 0 ? raw.family : raw.id;
  const entry: Record<string, unknown> = {
    id: raw.id,
    vendor,
    family,
    // Behaviour fields — minimal defaults; the registry's vendor-merge
    // will fill in the rest based on `vendor`. Setting only what
    // models.dev actually authors keeps the snapshot small.
    parallelToolCalls: false,
    promptCaching: 'none',
    toolDefinitionFormat: 'openai',
    maxRecommendedTurnBudget: 10,
    strictJson: true,
    quirks: [],
    profileId: `models-dev-${vendor}`,
    source: 'models-dev',
  };
  attachOptionalFields(entry, raw);
  // #4558: the entry is assembled field-by-field as a `Record<string, unknown>`
  // because `attachOptionalFields` mutates it, so TypeScript cannot see that
  // every required `ModelEntry` field is present. The double cast says that
  // plainly instead of a single cast the compiler rejects. There is no
  // `ModelEntry` schema to validate against; if one is ever added, this is the
  // call site that should use it rather than asserting.
  return entry as unknown as ModelEntry;
}

function attachOptionalFields(entry: Record<string, unknown>, raw: ModelsDevRecord): void {
  attachScalarFields(entry, raw);
  attachModalityFields(entry, raw);
  if (raw.cost?.input !== undefined && raw.cost.output !== undefined) {
    entry.pricing = { inputPer1M: raw.cost.input, outputPer1M: raw.cost.output };
  }
  // models.dev's `tool_call` is a boolean — present means supported.
  if (raw.tool_call === true) {
    entry.toolCapabilities = ['function-calling'];
  }
}

function attachScalarFields(entry: Record<string, unknown>, raw: ModelsDevRecord): void {
  if (raw.name !== undefined && raw.name !== raw.id) entry.displayName = raw.name;
  if (raw.last_updated !== undefined) entry.verifiedAt = raw.last_updated;
  if (raw.limit?.context !== undefined) entry.contextWindow = raw.limit.context;
  if (raw.limit?.output !== undefined) entry.maxOutputTokens = raw.limit.output;
}

function attachModalityFields(entry: Record<string, unknown>, raw: ModelsDevRecord): void {
  const inputMods = (raw.modalities?.input ?? []).filter(isKnownInput);
  if (inputMods.length > 0) entry.inputModalities = inputMods;
  const outputMods = (raw.modalities?.output ?? []).filter(isKnownOutput);
  if (outputMods.length > 0) entry.outputModalities = outputMods;
}

const KNOWN_INPUT_MODS = new Set(['text', 'image', 'audio', 'video', 'pdf']);
const KNOWN_OUTPUT_MODS = new Set(['text', 'audio', 'image']);
function isKnownInput(m: string): m is 'text' | 'image' | 'audio' | 'video' | 'pdf' {
  return KNOWN_INPUT_MODS.has(m);
}
function isKnownOutput(m: string): m is 'text' | 'audio' | 'image' {
  return KNOWN_OUTPUT_MODS.has(m);
}

/**
 * Build the snapshot entries from the catalog. Sort deterministically
 * (provider, then model id) so re-fetching with unchanged input produces
 * a byte-for-byte identical JSON file.
 */
function buildSnapshotEntries(catalog: ModelsDevCatalog): ModelEntry[] {
  const result: ModelEntry[] = [];
  const providers = Object.keys(catalog).sort();
  for (const providerKey of providers) {
    const vendor = PROVIDER_TO_VENDOR[providerKey];
    if (vendor === undefined) continue;
    const provider = catalog[providerKey];
    if (provider?.models === undefined) continue;
    const modelIds = Object.keys(provider.models).sort();
    for (const id of modelIds) {
      const raw = provider.models[id];
      if (raw === undefined) continue;
      const entry = mapRecord(raw, vendor);
      if (entry !== null) result.push(entry);
    }
  }
  return result;
}

function serializeSnapshot(snapshot: ModelsDevSnapshot): string {
  // Use 2-space indent + trailing newline; matches Prettier defaults
  // for JSON files in this repo so the docs-check formatter idempotency
  // gate doesn't flap on every sync.
  return JSON.stringify(snapshot, null, 2) + '\n';
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check');

  console.log(`Fetching ${MODELS_DEV_URL} …`);
  const catalog = await fetchCatalog();
  const entries = buildSnapshotEntries(catalog);
  console.log(`Mapped ${String(entries.length)} entries across known vendors.`);

  const fetchedAt = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const snapshot: ModelsDevSnapshot = {
    version: 1,
    fetchedAt,
    sourceUrl: MODELS_DEV_URL,
    entries,
  };
  // Stabilize fetchedAt across check-mode runs: when running `--check`,
  // preserve the existing snapshot's fetchedAt so the diff captures only
  // schema/entry drift, not the date stamp.
  if (checkMode && existsSync(SNAPSHOT_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8')) as ModelsDevSnapshot;
      if (typeof existing.fetchedAt === 'string') {
        (snapshot as { fetchedAt: string }).fetchedAt = existing.fetchedAt;
      }
    } catch {
      // Ignore — drift detection will fire below.
    }
  }
  const next = serializeSnapshot(snapshot);

  if (checkMode) {
    const existing = existsSync(SNAPSHOT_PATH) ? readFileSync(SNAPSHOT_PATH, 'utf-8') : '';
    if (existing !== next) {
      console.error('models-dev-snapshot.json is stale.');
      console.error('Run `pnpm exec tsx scripts/sync-models-dev.ts` and commit the result.');
      process.exit(1);
    }
    console.log('Snapshot is up to date.');
    return;
  }

  writeFileSync(SNAPSHOT_PATH, next, 'utf-8');
  console.log(`Wrote ${SNAPSHOT_PATH} (${String(entries.length)} entries).`);
}

if (process.argv[1]?.endsWith('sync-models-dev.ts') === true) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
    process.exit(1);
  });
}
