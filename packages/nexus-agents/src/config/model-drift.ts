/**
 * Model-drift detector (#6625, layer 3: detect and propose).
 *
 * Diffs the models that discovery sources list today against the in-tree
 * registry and reports three things:
 *
 *   - **new models**: listed by a source, named by no registry entry, each with
 *     a drafted entry (family, tier, context window, price) whose unpublished
 *     fields read `unknown`;
 *   - **possibly retired**: registry entries that no measured source covering
 *     their vendor lists any more;
 *   - **coverage**: one line per source, `measured`, `unmeasured` (no
 *     credentials, not configured) or `failed` (the probe threw).
 *
 * It proposes and never applies. Promotion of a new model into routing is
 * owner-approved and out of scope here (#6625 panel, option B).
 *
 * The empty case is named: zero measured sources is `unmeasured`, never
 * "no drift". A source without credentials is not a source that found nothing.
 *
 * Matching goes through canonical identity (`canonicalModelKey`) and a
 * normalised id, so `claude-sonnet-4.6`, `anthropic/claude-sonnet-4-6` and a
 * dated snapshot of a known model are not reported as new.
 *
 * @module config/model-drift
 */

import { anyOf } from '../utils/verdict-aggregation.js';
import { isNonChatModelId } from '../adapters/gateway-catalog-filter.js';
import { getErrorMessage } from '../core/index.js';
import { canonicalModelKey } from './model-equivalence.js';
import { normaliseModelId, resolveModelIdentitySync, type ModelVendor } from './model-identity.js';

// ============================================================================
// Types
// ============================================================================

/** Price as a source publishes it, USD per 1M tokens. */
export interface ListedPricing {
  readonly inputPer1M?: number;
  readonly outputPer1M?: number;
}

/** One model row as a discovery source lists it. */
export interface ListedModel {
  readonly id: string;
  /** Epoch seconds, when the source publishes a creation time. */
  readonly createdAt?: number;
  readonly contextLength?: number;
  readonly pricing?: ListedPricing;
}

/** What one probe produced. `unmeasured` means the source could not be asked. */
export type DriftProbe =
  | { readonly status: 'measured'; readonly models: readonly ListedModel[] }
  | { readonly status: 'unmeasured'; readonly reason: string };

/** A discovery source. A throwing probe is recorded as `failed`. */
export interface DriftSource {
  readonly name: string;
  probe(): Promise<DriftProbe>;
}

/** The registry fields the diff reads. `ModelEntry` satisfies it. */
export interface DriftRegistryEntry {
  readonly id: string;
  readonly aliases?: readonly string[];
  readonly cliModelName?: string;
}

export type CoverageStatus = 'measured' | 'unmeasured' | 'failed';

export interface SourceCoverage {
  readonly source: string;
  readonly status: CoverageStatus;
  readonly modelCount: number;
  readonly reason?: string;
}

/** Coarse capability tier parsed from the id. Never used for recency. */
export type DraftTier = 'flagship' | 'mid' | 'small' | 'unknown';

/** A drafted registry entry for a new model. Unpublished fields are `unknown`. */
export interface DraftRegistryEntry {
  readonly id: string;
  readonly vendor: ModelVendor;
  readonly family: string;
  readonly tier: DraftTier;
  readonly contextWindow: number | 'unknown';
  readonly pricing: ListedPricing | 'unknown';
  /** ISO date (YYYY-MM-DD) the source says the model was created, or the string `unknown`. */
  readonly releasedAt: string;
}

export interface NewModel {
  /** Every spelling the sources listed for this model. */
  readonly listedAs: readonly string[];
  readonly sources: readonly string[];
  readonly draft: DraftRegistryEntry;
}

export interface RetiredCandidate {
  readonly id: string;
  readonly cliModelName?: string;
  readonly vendor: ModelVendor;
}

/** `unmeasured` when no source was measured; never read that as up to date. */
export type DriftVerdict = 'drift' | 'no-drift' | 'unmeasured';

export interface ModelDriftReport {
  readonly generatedAt: string;
  readonly verdict: DriftVerdict;
  readonly measuredSources: number;
  /** True when at least one source was not measured. */
  readonly partialCoverage: boolean;
  readonly coverage: readonly SourceCoverage[];
  readonly newModels: readonly NewModel[];
  readonly possiblyRetired: readonly RetiredCandidate[];
  /** Registry ids whose vendor no measured source covers, so retirement is unknown. */
  readonly retirementUnmeasured: readonly string[];
  /**
   * Listed models left out of `newModels`, by reason. `latestAlias` counts
   * vendor `-latest` pointers, which name an existing model rather than a new one.
   */
  readonly excluded: Readonly<Record<Exclusion, number>>;
  readonly recencyWindowDays: number;
}

export interface DetectModelDriftInput {
  readonly sources: readonly DriftSource[];
  readonly registry: readonly DriftRegistryEntry[];
  readonly nowMs: number;
  /** Models created longer ago than this are not proposed (default 180). */
  readonly recencyWindowDays?: number;
}

/** A model older than this is not a new frontier model, whatever the registry says. */
export const DEFAULT_RECENCY_WINDOW_DAYS = 180;

const SECONDS_PER_DAY = 86_400;

// ============================================================================
// Identity keys
// ============================================================================

/** Trailing date stamp: `-20251001` or `-2024-08-06`. */
const DATE_SUFFIX = /-(?:\d{8}|\d{4}-\d{2}-\d{2})$/;

/** Drop a `vendor/` prefix and a `:tag` suffix (`:free`, `:beta`). */
function bareId(id: string): string {
  const slash = id.lastIndexOf('/');
  const noPrefix = slash >= 0 ? id.slice(slash + 1) : id;
  return noPrefix.replace(/:[a-z0-9-]+$/i, '');
}

/**
 * Keys under which a model string is "the same model". Two strings match when
 * they share any key: the normalised bare id with `.` unified to `-` and a date
 * stamp dropped, or the canonical `vendor|family|version` key when the id
 * carries a version (a versionless key would merge a whole family).
 */
export function driftMatchKeys(id: string): readonly string[] {
  const bare = bareId(id);
  const norm = normaliseModelId(bare).replace(/\./g, '-').replace(DATE_SUFFIX, '');
  const keys = [`id:${norm}`];
  const canon = canonicalModelKey(norm);
  if (canon !== null && !canon.endsWith('|')) keys.push(`canon:${canon}`);
  return keys;
}

function vendorOf(id: string): ModelVendor {
  return resolveModelIdentitySync(bareId(id)).vendor;
}

// ============================================================================
// Probing
// ============================================================================

interface ProbedSource {
  readonly coverage: SourceCoverage;
  readonly models: readonly ListedModel[];
}

async function probeOne(source: DriftSource): Promise<ProbedSource> {
  try {
    const result = await source.probe();
    if (result.status === 'unmeasured') {
      return {
        coverage: {
          source: source.name,
          status: 'unmeasured',
          modelCount: 0,
          reason: result.reason,
        },
        models: [],
      };
    }
    return {
      coverage: { source: source.name, status: 'measured', modelCount: result.models.length },
      models: result.models,
    };
  } catch (error: unknown) {
    return {
      coverage: {
        source: source.name,
        status: 'failed',
        modelCount: 0,
        reason: getErrorMessage(error),
      },
      models: [],
    };
  }
}

// ============================================================================
// Classification
// ============================================================================

const SMALL_TIER = /\b(haiku|mini|nano|lite|small|tiny)\b/;
const FLAGSHIP_TIER = /\b(opus|pro|ultra)\b/;
const MID_TIER = /\b(sonnet|flash)\b/;

/** Tier from id tokens. Small is checked first so `flash-lite` is small. */
export function draftTier(id: string): DraftTier {
  const norm = normaliseModelId(bareId(id));
  if (SMALL_TIER.test(norm)) return 'small';
  if (FLAGSHIP_TIER.test(norm)) return 'flagship';
  if (MID_TIER.test(norm)) return 'mid';
  return 'unknown';
}

/** Why a listed, unknown model is not proposed. */
export type Exclusion = 'nonChat' | 'untrackedVendor' | 'olderThanWindow' | 'latestAlias';

const EXCLUSIONS: readonly Exclusion[] = [
  'nonChat',
  'untrackedVendor',
  'olderThanWindow',
  'latestAlias',
];

/** A vendor `-latest` pointer (`claude-opus-latest`) names an existing model. */
const LATEST_ALIAS = /-latest$/;

interface Candidate {
  readonly keys: Set<string>;
  readonly listedAs: string[];
  readonly sources: string[];
  createdAt?: number | undefined;
  contextLength?: number | undefined;
  pricing?: ListedPricing | undefined;
}

function mergeInto(candidate: Candidate, model: ListedModel, source: string): void {
  if (!candidate.listedAs.includes(model.id)) candidate.listedAs.push(model.id);
  if (!candidate.sources.includes(source)) candidate.sources.push(source);
  for (const key of driftMatchKeys(model.id)) candidate.keys.add(key);
  candidate.createdAt ??= model.createdAt;
  candidate.contextLength ??= model.contextLength;
  candidate.pricing ??= model.pricing;
}

function newCandidate(model: ListedModel, source: string): Candidate {
  const candidate: Candidate = { keys: new Set(), listedAs: [], sources: [] };
  mergeInto(candidate, model, source);
  return candidate;
}

function toDraft(candidate: Candidate): DraftRegistryEntry {
  const id = bareId(candidate.listedAs[0] ?? '');
  const identity = resolveModelIdentitySync(id);
  return {
    id,
    vendor: identity.vendor,
    family: identity.family,
    tier: draftTier(id),
    contextWindow: candidate.contextLength ?? 'unknown',
    pricing: candidate.pricing ?? 'unknown',
    releasedAt:
      candidate.createdAt === undefined
        ? 'unknown'
        : new Date(candidate.createdAt * 1000).toISOString().slice(0, 10),
  };
}

// ============================================================================
// Diff
// ============================================================================

interface RegistryIndex {
  readonly keys: ReadonlySet<string>;
  readonly vendors: ReadonlySet<ModelVendor>;
}

function registryStrings(entry: DriftRegistryEntry): readonly string[] {
  return [
    entry.id,
    ...(entry.aliases ?? []),
    ...(entry.cliModelName !== undefined ? [entry.cliModelName] : []),
  ];
}

function registryVendor(entry: DriftRegistryEntry): ModelVendor {
  return vendorOf(entry.cliModelName ?? entry.id);
}

function indexRegistry(registry: readonly DriftRegistryEntry[]): RegistryIndex {
  const keys = new Set<string>();
  const vendors = new Set<ModelVendor>();
  for (const entry of registry) {
    for (const s of registryStrings(entry)) for (const k of driftMatchKeys(s)) keys.add(k);
    const vendor = registryVendor(entry);
    if (vendor !== 'unknown') vendors.add(vendor);
  }
  return { keys, vendors };
}

function sharesKey(keys: readonly string[], set: ReadonlySet<string>): boolean {
  return keys.some((k) => set.has(k));
}

interface ListingScan {
  readonly listedKeys: ReadonlySet<string>;
  readonly coveredVendors: ReadonlySet<ModelVendor>;
  readonly candidates: readonly Candidate[];
  readonly excluded: Record<Exclusion, number>;
}

function exclusionFor(
  model: ListedModel,
  index: RegistryIndex,
  oldestCreatedS: number
): Exclusion | undefined {
  // Gateway discovery drops these already (#6617); vendor list endpoints and
  // catalogs return everything.
  if (isNonChatModelId(model.id)) return 'nonChat';
  if (!index.vendors.has(vendorOf(model.id))) return 'untrackedVendor';
  if (LATEST_ALIAS.test(bareId(model.id).toLowerCase())) return 'latestAlias';
  if (model.createdAt !== undefined && model.createdAt < oldestCreatedS) return 'olderThanWindow';
  return undefined;
}

/** Mutable scan state; excluded models are de-duplicated by their first key. */
interface ScanState {
  readonly listedKeys: Set<string>;
  readonly coveredVendors: Set<ModelVendor>;
  readonly candidates: Candidate[];
  readonly excludedIds: Map<Exclusion, Set<string>>;
}

function scanModel(
  state: ScanState,
  model: ListedModel,
  source: string,
  ctx: { readonly index: RegistryIndex; readonly oldestCreatedS: number }
): void {
  const keys = driftMatchKeys(model.id);
  for (const k of keys) state.listedKeys.add(k);
  const vendor = vendorOf(model.id);
  if (vendor !== 'unknown') state.coveredVendors.add(vendor);
  if (sharesKey(keys, ctx.index.keys)) return;
  const existing = state.candidates.find((c) => sharesKey(keys, c.keys));
  if (existing !== undefined) {
    mergeInto(existing, model, source);
    return;
  }
  const exclusion = exclusionFor(model, ctx.index, ctx.oldestCreatedS);
  if (exclusion === undefined) state.candidates.push(newCandidate(model, source));
  else state.excludedIds.get(exclusion)?.add(keys[0] ?? model.id);
}

function scanListings(
  probed: readonly ProbedSource[],
  index: RegistryIndex,
  oldestCreatedS: number
): ListingScan {
  const state: ScanState = {
    listedKeys: new Set(),
    coveredVendors: new Set(),
    candidates: [],
    excludedIds: new Map(EXCLUSIONS.map((e) => [e, new Set<string>()])),
  };
  for (const { coverage, models } of probed) {
    for (const model of models) scanModel(state, model, coverage.source, { index, oldestCreatedS });
  }
  const excluded = Object.fromEntries(
    EXCLUSIONS.map((e) => [e, state.excludedIds.get(e)?.size ?? 0])
  ) as Record<Exclusion, number>;
  return { ...state, excluded };
}

function splitRetirement(
  registry: readonly DriftRegistryEntry[],
  scan: ListingScan
): { possiblyRetired: RetiredCandidate[]; retirementUnmeasured: string[] } {
  const possiblyRetired: RetiredCandidate[] = [];
  const retirementUnmeasured: string[] = [];
  for (const entry of registry) {
    const keys = registryStrings(entry).flatMap((s) => driftMatchKeys(s));
    if (sharesKey(keys, scan.listedKeys)) continue;
    const vendor = registryVendor(entry);
    if (!scan.coveredVendors.has(vendor)) {
      retirementUnmeasured.push(entry.id);
      continue;
    }
    possiblyRetired.push({
      id: entry.id,
      vendor,
      ...(entry.cliModelName !== undefined && { cliModelName: entry.cliModelName }),
    });
  }
  return { possiblyRetired, retirementUnmeasured };
}

function decideVerdict(
  coverage: readonly SourceCoverage[],
  newCount: number,
  retiredCount: number
): DriftVerdict {
  // Zero sources, or none measured, is unmeasured: absence is not "up to date".
  const anyMeasured = anyOf(coverage, (c) => c.status === 'measured', false);
  if (!anyMeasured) return 'unmeasured';
  return newCount + retiredCount > 0 ? 'drift' : 'no-drift';
}

/**
 * Probe every source, then diff the listings against the registry. Never
 * throws: a failing source becomes a `failed` coverage line.
 */
export async function detectModelDrift(input: DetectModelDriftInput): Promise<ModelDriftReport> {
  const windowDays = input.recencyWindowDays ?? DEFAULT_RECENCY_WINDOW_DAYS;
  const probed = await Promise.all(input.sources.map(probeOne));
  const coverage = probed.map((p) => p.coverage);
  const measured = probed.filter((p) => p.coverage.status === 'measured');
  const index = indexRegistry(input.registry);
  const oldestCreatedS = Math.floor(input.nowMs / 1000) - windowDays * SECONDS_PER_DAY;
  const scan = scanListings(measured, index, oldestCreatedS);
  const { possiblyRetired, retirementUnmeasured } = splitRetirement(input.registry, scan);
  const newModels = scan.candidates.map((c) => ({
    listedAs: [...c.listedAs],
    sources: [...c.sources],
    draft: toDraft(c),
  }));
  return {
    generatedAt: new Date(input.nowMs).toISOString(),
    verdict: decideVerdict(coverage, newModels.length, possiblyRetired.length),
    measuredSources: measured.length,
    partialCoverage: measured.length < coverage.length,
    coverage,
    newModels,
    possiblyRetired,
    retirementUnmeasured,
    excluded: scan.excluded,
    recencyWindowDays: windowDays,
  };
}
