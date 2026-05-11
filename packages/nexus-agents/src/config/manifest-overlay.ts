/**
 * Operator manifest overlay for the unified `ModelRegistry` (#2547 4a).
 *
 * Reads a YAML or JSON manifest of `ModelEntry` records from disk and
 * returns them in a shape the `ModelRegistry` can ingest via its
 * `manifestEntries` option. Manifest entries win over in-tree
 * authoritative entries — operators use this to override pricing or
 * capability flags without an npm release, or to declare models the
 * in-tree registry doesn't know about (gateway-fronted variants,
 * vendor pre-releases, etc.).
 *
 * Fully optional — missing file, empty file, malformed YAML/JSON, and
 * schema-invalid entries all return the empty overlay with structured
 * rejections instead of throwing. The same robustness contract as the
 * older `capability-overlay.ts` (which targets the legacy
 * `ModelCapability` shape).
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

/** Env var an operator sets to point at a non-default manifest path. */
export const MANIFEST_ENV_VAR = 'NEXUS_MODELS_OVERLAY_PATH';

/** Max manifest size accepted (1 MB — far larger than any realistic manifest). */
export const MANIFEST_MAX_BYTES = 1 * 1024 * 1024;

/**
 * Default manifest location: `<NEXUS_DATA_DIR>/models-manifest.yaml`. Distinct
 * from the legacy `models.yaml` used by `capability-overlay.ts` so operators
 * can run both overlays side-by-side during the #2546 migration window.
 */
export function defaultManifestPath(): string {
  return nexusDataPath('models-manifest.yaml');
}

/**
 * Resolve the manifest path. `NEXUS_MODELS_OVERLAY_PATH` wins if set;
 * otherwise the default `~/.nexus-agents/models-manifest.yaml`.
 */
export function resolveManifestPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[MANIFEST_ENV_VAR];
  if (override !== undefined && override !== '') return override;
  return defaultManifestPath();
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
 * Load + validate the operator manifest. Returns structured results;
 * never throws. The registry consumer is responsible for surfacing
 * `rejections` (logger.warn / audit-log per #2547 DoD).
 */
export function loadManifestOverlay(options?: {
  readonly path?: string;
  readonly logger?: ILogger;
  readonly env?: NodeJS.ProcessEnv;
}): ManifestLoadResult {
  const logger = options?.logger ?? createLogger({ component: 'manifest-overlay' });
  const path = options?.path ?? resolveManifestPath(options?.env);

  if (!existsSync(path)) {
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
