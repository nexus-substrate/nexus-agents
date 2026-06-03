/**
 * Manifest overlay for the unified `ModelRegistry` (#2547 4a, #3351).
 *
 * Reads YAML or JSON manifests of `ModelEntry` records from disk and
 * returns them in a shape the `ModelRegistry` can ingest via its
 * `manifestEntries` option. Manifest entries win over in-tree
 * authoritative entries — used to override pricing or capability flags
 * without an npm release, or to declare models the in-tree registry
 * doesn't know about (gateway-fronted variants, vendor pre-releases).
 *
 * TWO paths are merged into the single `manifest` registry tier (#3351):
 *
 *   1. USER path — `~/.nexus-agents/models.yaml` (or whatever
 *      `NEXUS_MODEL_REGISTRY_OVERLAY` points at). Loaded FIRST, lower
 *      precedence. Lets an individual user override model data without a
 *      release. As of #3351 this file uses the SAME ManifestSchema /
 *      `ModelEntry` shape as the operator manifest below — the old
 *      `ModelCapability` format (handled by the now-deleted
 *      `capability-overlay.ts`) had zero production effect, so there is
 *      nothing to migrate.
 *   2. OPERATOR path — `~/.nexus-agents/models-manifest.yaml` (or
 *      whatever `NEXUS_MODELS_OVERLAY_PATH` points at). Loaded SECOND,
 *      higher precedence. On an id collision the operator entry
 *      overwrites the user entry.
 *
 * Net registry precedence (low → high):
 *   generated < models-dev < in-tree < USER-overlay < OPERATOR-manifest.
 * The whole manifest tier sits above in-tree; within it, operator beats
 * user via load order.
 *
 * Fully optional and fail-closed — missing file, empty file, malformed
 * YAML/JSON, schema-invalid entries, and oversized files all degrade to
 * the empty overlay with structured rejections instead of throwing.
 *
 * @module config/manifest-overlay
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { createLogger } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import { nexusDataPath } from './nexus-data-dir.js';
import type { ModelEntry, ToolDefinitionFormat, PromptCachingMode } from './model-registry.js';
import type { ModelVendor } from './model-identity.js';
import {
  OUTPUT_MODALITIES,
  INPUT_MODALITIES,
  TOOL_CAPABILITIES,
  SPECIAL_FEATURES,
  PricingSchema,
  QualityScoresSchema,
} from './model-capabilities-types.js';

/** Env var an operator sets to point at a non-default OPERATOR manifest path. */
export const MANIFEST_ENV_VAR = 'NEXUS_MODELS_OVERLAY_PATH';

/** Env var a USER sets to point at a non-default user overlay path (#3351). */
export const USER_MANIFEST_ENV_VAR = 'NEXUS_MODEL_REGISTRY_OVERLAY';

/** Max manifest size accepted (1 MB — far larger than any realistic manifest). */
export const MANIFEST_MAX_BYTES = 1 * 1024 * 1024;

/**
 * Default OPERATOR manifest location: `<NEXUS_DATA_DIR>/models-manifest.yaml`.
 */
export function defaultManifestPath(): string {
  return nexusDataPath('models-manifest.yaml');
}

/**
 * Default USER overlay location: `<NEXUS_DATA_DIR>/models.yaml` (#3351).
 * Lower precedence than the operator manifest; same ManifestSchema shape.
 */
export function defaultUserManifestPath(): string {
  return nexusDataPath('models.yaml');
}

/**
 * Resolve the OPERATOR manifest path. `NEXUS_MODELS_OVERLAY_PATH` wins if set;
 * otherwise the default `~/.nexus-agents/models-manifest.yaml`.
 */
export function resolveManifestPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[MANIFEST_ENV_VAR];
  if (override !== undefined && override !== '') return override;
  return defaultManifestPath();
}

/**
 * Resolve the USER overlay path. `NEXUS_MODEL_REGISTRY_OVERLAY` wins if set;
 * otherwise the default `~/.nexus-agents/models.yaml` (#3351).
 */
export function resolveUserManifestPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[USER_MANIFEST_ENV_VAR];
  if (override !== undefined && override !== '') return override;
  return defaultUserManifestPath();
}

// ============================================================================
// Result shape
// ============================================================================

export interface ManifestRejection {
  readonly index: number;
  readonly id?: string;
  readonly reason: string;
}

export interface ManifestLoadResult {
  readonly entries: readonly ModelEntry[];
  readonly rejections: readonly ManifestRejection[];
  readonly path: string;
  readonly status: 'missing' | 'empty' | 'malformed' | 'too-large' | 'loaded';
}

// ============================================================================
// Zod schema for a manifest entry
// ============================================================================

const ModelVendorSchema: z.ZodType<ModelVendor> = z.enum([
  'anthropic',
  'openai',
  'google',
  'meta',
  'qwen',
  'nvidia',
  'mistral',
  'cohere',
  'deepseek',
  'unknown',
]);

const ToolDefinitionFormatSchema = z.enum([
  'openai',
  'anthropic',
  'gemini',
]) satisfies z.ZodType<ToolDefinitionFormat>;

const PromptCachingModeSchema = z.enum([
  'none',
  'ephemeral',
  'aggressive',
]) satisfies z.ZodType<PromptCachingMode>;

/**
 * Manifest entries are intentionally MORE permissive than the in-tree
 * ModelEntry: every behaviour field has a sensible default, so operators
 * can specify just `{id, vendor, family}` for a minimum-viable entry
 * and let the loader fill the rest from `DEFAULT_ENTRY` + vendor profile.
 */
export const ManifestEntrySchema = z.object({
  // Identity (required)
  id: z.string().min(1).max(200),
  vendor: ModelVendorSchema,
  family: z.string().min(1).max(80),

  // Identity (optional)
  aliases: z.array(z.string().min(1).max(200)).max(20).optional(),
  version: z.string().min(1).max(50).optional(),
  displayName: z.string().min(1).max(200).optional(),

  // Capabilities (all optional)
  contextWindow: z.number().int().positive().max(20_000_000).optional(),
  maxOutputTokens: z.number().int().positive().max(20_000_000).optional(),
  inputModalities: z.array(z.enum(INPUT_MODALITIES)).optional(),
  outputModalities: z.array(z.enum(OUTPUT_MODALITIES)).optional(),
  toolCapabilities: z.array(z.enum(TOOL_CAPABILITIES)).optional(),
  specialFeatures: z.array(z.enum(SPECIAL_FEATURES)).optional(),
  pricing: PricingSchema.optional(),
  qualityScores: QualityScoresSchema.optional(),
  notes: z.string().max(2000).optional(),

  // Behaviour (all optional — defaults fill in)
  parallelToolCalls: z.boolean().optional(),
  promptCaching: PromptCachingModeSchema.optional(),
  toolDefinitionFormat: ToolDefinitionFormatSchema.optional(),
  maxRecommendedTurnBudget: z.number().int().positive().max(100).optional(),
  strictJson: z.boolean().optional(),
  quirks: z.array(z.string().max(80)).max(20).optional(),
  profileId: z.string().min(1).max(80).optional(),

  // Provenance (optional)
  verifiedAt: z.string().min(8).max(40).optional(),
});

export const ManifestSchema = z.object({
  version: z.literal(1),
  models: z.array(z.unknown()),
});

// ============================================================================
// Loader
// ============================================================================

/**
 * Load + validate the merged manifest overlay (USER then OPERATOR, #3351).
 * Returns structured results; never throws. The registry consumer is
 * responsible for surfacing `rejections` (logger.warn / audit per #2547 DoD).
 *
 * When an explicit `path` is given (tests / single-file inspection) only that
 * file is loaded — single-path behaviour is preserved. With no `path`, both
 * the user overlay (`~/.nexus-agents/models.yaml`) and the operator manifest
 * (`~/.nexus-agents/models-manifest.yaml`) are loaded and merged by id, with
 * the operator entry winning on collision.
 */
export function loadManifestOverlay(options?: {
  readonly path?: string;
  readonly logger?: ILogger;
  readonly env?: NodeJS.ProcessEnv;
}): ManifestLoadResult {
  const logger = options?.logger ?? createLogger({ component: 'manifest-overlay' });

  // Explicit path → single-file load (preserves the original contract).
  if (options?.path !== undefined) {
    return loadManifestFile(options.path, logger);
  }

  // Default → merge USER overlay (lower precedence) under the OPERATOR
  // manifest (higher precedence). Operator overwrites user on id collision.
  const userPath = resolveUserManifestPath(options?.env);
  const operatorPath = resolveManifestPath(options?.env);
  const user = loadManifestFile(userPath, logger);
  const operator = loadManifestFile(operatorPath, logger);
  return mergeOverlays(user, operator);
}

/**
 * Merge two overlay results: `lower` first, then `higher`. Entries from
 * `higher` overwrite same-id entries from `lower`. Status/path/rejections
 * are reported for the OPERATOR (higher-precedence) result so the registry's
 * existing `status === 'loaded'` gate behaves unchanged; user-only state is
 * reported via {@link loadUserManifestOverlay} for the doctor.
 */
function mergeOverlays(lower: ManifestLoadResult, higher: ManifestLoadResult): ManifestLoadResult {
  const byId = new Map<string, ModelEntry>();
  for (const entry of lower.entries) byId.set(entry.id, entry);
  for (const entry of higher.entries) byId.set(entry.id, entry);
  const entries = [...byId.values()];
  const merged: ManifestLoadResult = {
    entries,
    rejections: [...lower.rejections, ...higher.rejections],
    path: higher.path,
    status: entries.length > 0 ? 'loaded' : higher.status,
  };
  return merged;
}

/**
 * Load + validate just the USER overlay (`~/.nexus-agents/models.yaml` or the
 * `NEXUS_MODEL_REGISTRY_OVERLAY` override). Reported by `registry doctor` for
 * inspection of the user-path status / entryCount (#3351).
 */
export function loadUserManifestOverlay(options?: {
  readonly path?: string;
  readonly logger?: ILogger;
  readonly env?: NodeJS.ProcessEnv;
}): ManifestLoadResult {
  const logger = options?.logger ?? createLogger({ component: 'manifest-overlay' });
  const path = options?.path ?? resolveUserManifestPath(options?.env);
  return loadManifestFile(path, logger);
}

/**
 * Load + validate a single manifest file. Returns structured results;
 * never throws.
 */
function loadManifestFile(path: string, logger: ILogger): ManifestLoadResult {
  // Defensive: tests sometimes `vi.mock('node:fs', ...)` with a subset
  // of exports that omits `existsSync`. Treat any throw from the probe
  // as "no manifest" rather than letting it crash module-load callers.
  let exists = false;
  try {
    exists = existsSync(path);
  } catch {
    return { entries: [], rejections: [], path, status: 'missing' };
  }
  if (!exists) {
    return { entries: [], rejections: [], path, status: 'missing' };
  }

  const stat = statSync(path);
  if (stat.size === 0) {
    return { entries: [], rejections: [], path, status: 'empty' };
  }
  if (stat.size > MANIFEST_MAX_BYTES) {
    logger.warn('Manifest overlay too large; skipping', {
      path,
      size: stat.size,
      max: MANIFEST_MAX_BYTES,
    });
    return { entries: [], rejections: [], path, status: 'too-large' };
  }

  const raw = readFileSync(path, 'utf-8');
  return parseManifest(raw, path, logger);
}

function parseManifest(raw: string, path: string, logger: ILogger): ManifestLoadResult {
  let parsed: unknown;
  try {
    if (path.endsWith('.json')) {
      parsed = JSON.parse(raw);
    } else {
      parsed = parseYaml(raw);
    }
  } catch (e: unknown) {
    logger.warn('Manifest overlay parse failure; skipping', {
      path,
      error: e instanceof Error ? e.message : String(e),
    });
    return { entries: [], rejections: [], path, status: 'malformed' };
  }

  const shape = ManifestSchema.safeParse(parsed);
  if (!shape.success) {
    logger.warn('Manifest overlay schema mismatch at root; skipping', {
      path,
      issues: shape.error.issues.slice(0, 5).map((i) => i.message),
    });
    return { entries: [], rejections: [], path, status: 'malformed' };
  }

  const entries: ModelEntry[] = [];
  const rejections: ManifestRejection[] = [];

  shape.data.models.forEach((rawEntry, index) => {
    const result = ManifestEntrySchema.safeParse(rawEntry);
    if (!result.success) {
      const candidateId =
        typeof rawEntry === 'object' &&
        rawEntry !== null &&
        'id' in rawEntry &&
        typeof rawEntry.id === 'string'
          ? rawEntry.id
          : undefined;
      const baseRejection: { index: number; reason: string; id?: string } = {
        index,
        reason: result.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      };
      if (candidateId !== undefined) baseRejection.id = candidateId;
      rejections.push(baseRejection);
      return;
    }
    entries.push(materializeEntry(result.data));
  });

  return { entries, rejections, path, status: 'loaded' };
}

/**
 * Convert a validated partial manifest entry into a full `ModelEntry`.
 * Behaviour fields default to `DEFAULT_ENTRY`; the merge mirrors the
 * registry's vendor-defaults logic so operators can specify the minimum
 * `{id, vendor, family}` and get a usable record.
 */
function materializeEntry(input: z.infer<typeof ManifestEntrySchema>): ModelEntry {
  return {
    id: input.id,
    vendor: input.vendor,
    family: input.family,
    // Behaviour with sensible defaults
    parallelToolCalls: input.parallelToolCalls ?? false,
    promptCaching: input.promptCaching ?? 'none',
    toolDefinitionFormat: input.toolDefinitionFormat ?? 'openai',
    maxRecommendedTurnBudget: input.maxRecommendedTurnBudget ?? 10,
    strictJson: input.strictJson ?? true,
    quirks: input.quirks ?? [],
    profileId: input.profileId ?? `manifest-${input.vendor}`,
    source: 'manifest',
    ...pickOptionalFields(input),
  };
}

/**
 * Spread-helper that returns only the optional ModelEntry fields the
 * input actually carries. Keeps `materializeEntry` under the complexity
 * cap and makes the optional-passthrough pattern testable in isolation.
 */
/**
 * Optional fields that pass through verbatim from manifest → ModelEntry
 * when present. Data-driven so we keep cyclomatic complexity flat.
 */
const OPTIONAL_PASSTHROUGH_KEYS = [
  'aliases',
  'version',
  'displayName',
  'contextWindow',
  'maxOutputTokens',
  'inputModalities',
  'outputModalities',
  'toolCapabilities',
  'specialFeatures',
  'pricing',
  'qualityScores',
  'notes',
  'verifiedAt',
] as const;

function pickOptionalFields(
  input: z.infer<typeof ManifestEntrySchema>
): Partial<{ -readonly [K in keyof ModelEntry]: ModelEntry[K] }> {
  const out: Record<string, unknown> = {};
  const inputRecord = input as Record<string, unknown>;
  for (const key of OPTIONAL_PASSTHROUGH_KEYS) {
    const value = inputRecord[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}
