/**
 * CapabilityDiscovery — synchronous four-tier model capability resolution
 * for epic #2174 (child issue #2176).
 *
 * Lookup order: **T3 user YAML overlay → T1 hardcoded canonical → T2 bundled
 * generated → T4 conservative default**. User overlay wins so operators can
 * fix a broken bundled or canonical entry. No runtime network fetch — T2 is
 * loaded once from the bundled JSON (or skipped if the file is missing /
 * corrupt). Injection points exist for tests so no test ever touches the
 * real filesystem or network.
 *
 * This issue (#2176) only delivers the class + tests. Existing call sites
 * keep using the direct T1 helpers in `model-config-helpers.ts` (the
 * registry-backed surface that replaced the legacy `model-capabilities.ts`
 * after #2546 slice E) — those get migrated when #2177 flips the
 * conservative default from the legacy 200 K fall-through to fail-closed
 * 8 K, and when #2178 wires the T3 YAML loader in.
 *
 * @module config/capability-discovery
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { z } from 'zod';

import type { ILogger } from '../core/index.js';
import { createLogger } from '../core/index.js';
import { getInTreeCapabilitiesMatrix } from './model-config-helpers.js';
import type {
  ModelCapabilitiesMatrix,
  ModelCapability,
  Pricing,
} from './model-capabilities-types.js';
import { loadCapabilityOverlay } from './capability-overlay.js';

// ---------------------------------------------------------------------------
// Generated (T2) shape — mirrors scripts/build-model-registry-types.ts
// ---------------------------------------------------------------------------

const GeneratedProvenanceSchema = z.object({
  source: z.enum(['models.dev', 'litellm']),
  fetchedAt: z.string(),
  upstreamUrl: z.string(),
});

export type GeneratedProvenance = z.infer<typeof GeneratedProvenanceSchema>;

const GeneratedModelEntrySchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  provider: z.string().min(1),
  contextWindow: z.number().int().positive(),
  pricing: z
    .object({
      inputPer1M: z.number().nonnegative(),
      outputPer1M: z.number().nonnegative(),
    })
    .optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  deprecated: z.boolean().optional(),
  provenance: GeneratedProvenanceSchema,
});

export type GeneratedModelEntry = z.infer<typeof GeneratedModelEntrySchema>;

const GeneratedRegistrySchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  entryCount: z.number().int().nonnegative(),
  entries: z.array(GeneratedModelEntrySchema),
});

export type GeneratedRegistry = z.infer<typeof GeneratedRegistrySchema>;

// ---------------------------------------------------------------------------
// T4 conservative-default toggles
// ---------------------------------------------------------------------------

/** Conservative default returned when no tier resolves a model id. */
export interface ConservativeDefault {
  readonly contextWindow: number;
  readonly maxOutputTokens?: number;
}

/**
 * Legacy default matching today's `getModelContextWindow` 200 K fall-through.
 * Preserved so this issue (#2176) is a pure addition. Issue #2177 will
 * switch the default to `FAIL_CLOSED_DEFAULT` and update the routing paths
 * to skip models resolved at T4.
 */
export const LEGACY_200K_DEFAULT: ConservativeDefault = { contextWindow: 200_000 };

/** Fail-closed default that #2177 will flip on. */
export const FAIL_CLOSED_DEFAULT: ConservativeDefault = { contextWindow: 8_192 };

// ---------------------------------------------------------------------------
// ResolvedCapability — unified shape returned by resolve()
// ---------------------------------------------------------------------------

export type ResolutionTier = 't1' | 't2' | 't3' | 't4';

export interface ResolvedCapability {
  readonly tier: ResolutionTier;
  readonly id: string;
  readonly displayName: string;
  readonly provider: string;
  readonly contextWindow: number;
  readonly pricing?: Pricing;
  readonly maxOutputTokens?: number;
  readonly deprecated?: boolean;
  /** Full T1/T3 entry when resolved from the canonical-shaped tiers. */
  readonly canonical?: ModelCapability;
  /** Provenance when resolved from T2. */
  readonly provenance?: GeneratedProvenance;
}

// ---------------------------------------------------------------------------
// Config + construction
// ---------------------------------------------------------------------------

export interface CapabilityDiscoveryConfig {
  /** T1 canonical registry. Defaults to the in-tree matrix from the ModelRegistry. */
  readonly canonical?: ModelCapabilitiesMatrix;
  /** T2 bundled generated registry. Pass `null` to force-skip T2. */
  readonly generated?: GeneratedRegistry | null;
  /** T3 user overlay entries. Defaults to empty. Loader is #2178. */
  readonly overlay?: readonly ModelCapability[];
  /** T4 fallback. Defaults to `LEGACY_200K_DEFAULT` until #2177 flips it. */
  readonly conservativeDefault?: ConservativeDefault;
  /** Logger; defaults to a named logger. Inject a mock in tests. */
  readonly logger?: ILogger;
}

export class CapabilityDiscovery {
  private readonly canonical: ModelCapabilitiesMatrix;
  private readonly generated: GeneratedRegistry | null;
  private readonly overlay: readonly ModelCapability[];
  private readonly fallback: ConservativeDefault;
  private readonly logger: ILogger;
  private readonly generatedById: Map<string, GeneratedModelEntry>;

  constructor(config: CapabilityDiscoveryConfig = {}) {
    // The helper returns a readonly view; loosen here because
    // `ModelCapabilitiesMatrix` predates the registry and uses mutable
    // arrays. Callers in this class only read.
    this.canonical = config.canonical ?? (getInTreeCapabilitiesMatrix() as ModelCapabilitiesMatrix);
    this.generated = config.generated ?? null;
    this.overlay = config.overlay ?? [];
    this.fallback = config.conservativeDefault ?? LEGACY_200K_DEFAULT;
    this.logger = config.logger ?? createLogger({ component: 'capability-discovery' });

    this.generatedById = new Map();
    if (this.generated !== null) {
      for (const entry of this.generated.entries) {
        this.generatedById.set(entry.id, entry);
      }
    }
  }

  /** Synchronously resolve a model id through the four-tier chain. */
  resolve(modelId: string): ResolvedCapability {
    const t3 = this.lookupOverlay(modelId);
    if (t3 !== undefined) return this.fromCanonical('t3', t3);

    const t1 = this.lookupCanonical(modelId);
    if (t1 !== undefined) return this.fromCanonical('t1', t1);

    const t2 = this.lookupGenerated(modelId);
    if (t2 !== undefined) return this.fromGenerated('t2', t2);

    return this.fromFallback(modelId);
  }

  /** Exposes the configured fallback for testing / doctor command. */
  getConservativeDefault(): ConservativeDefault {
    return this.fallback;
  }

  /** Count of entries per tier — used by `registry doctor` (#2179). */
  getTierCounts(): Record<ResolutionTier, number> {
    return {
      t3: this.overlay.length,
      t1: this.canonical.models.length,
      t2: this.generatedById.size,
      t4: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Tier lookups
  // -------------------------------------------------------------------------

  private lookupOverlay(modelId: string): ModelCapability | undefined {
    return this.overlay.find((m) => m.id === modelId);
  }

  private lookupCanonical(modelId: string): ModelCapability | undefined {
    return this.canonical.models.find((m) => m.id === modelId);
  }

  private lookupGenerated(modelId: string): GeneratedModelEntry | undefined {
    const direct = this.generatedById.get(modelId);
    if (direct !== undefined) return direct;
    for (const candidate of buildAliasCandidates(modelId)) {
      const hit = this.generatedById.get(candidate);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }

  // -------------------------------------------------------------------------
  // Result shaping
  // -------------------------------------------------------------------------

  private fromCanonical(tier: 't1' | 't3', entry: ModelCapability): ResolvedCapability {
    const base: ResolvedCapability = {
      tier,
      id: entry.id,
      displayName: entry.displayName,
      provider: entry.provider,
      contextWindow: entry.contextWindow,
      canonical: entry,
      ...(entry.pricing !== undefined ? { pricing: entry.pricing } : {}),
      ...(entry.maxOutputTokens !== undefined ? { maxOutputTokens: entry.maxOutputTokens } : {}),
      ...(entry.deprecated !== undefined ? { deprecated: entry.deprecated } : {}),
    };
    return base;
  }

  private fromGenerated(tier: 't2', entry: GeneratedModelEntry): ResolvedCapability {
    return {
      tier,
      id: entry.id,
      displayName: entry.displayName,
      provider: entry.provider,
      contextWindow: entry.contextWindow,
      provenance: entry.provenance,
      ...(entry.pricing !== undefined ? { pricing: entry.pricing } : {}),
      ...(entry.maxOutputTokens !== undefined ? { maxOutputTokens: entry.maxOutputTokens } : {}),
      ...(entry.deprecated !== undefined ? { deprecated: entry.deprecated } : {}),
    };
  }

  private fromFallback(modelId: string): ResolvedCapability {
    this.logger.warn('Model resolved at T4 conservative default', {
      modelId,
      contextWindow: this.fallback.contextWindow,
    });
    return {
      tier: 't4',
      id: modelId,
      displayName: modelId,
      provider: 'unknown',
      contextWindow: this.fallback.contextWindow,
      ...(this.fallback.maxOutputTokens !== undefined
        ? { maxOutputTokens: this.fallback.maxOutputTokens }
        : {}),
    };
  }
}

// ---------------------------------------------------------------------------
// Alias resolution helpers
// ---------------------------------------------------------------------------

const KNOWN_PROVIDER_PREFIXES: readonly string[] = [
  'amazon-bedrock',
  'google-vertex',
  'azure-openai',
  'openrouter',
  'anthropic',
  'openai',
  'google',
  'deepseek',
];

/**
 * Generate candidate alias forms so versioned / prefix-stripped ids still
 * resolve to their T2 entry. Example inputs:
 *   anthropic.claude-3-5-sonnet-20241022-v2:0
 *   openrouter/anthropic/claude-3-5-sonnet
 *   gpt-5-codex
 */
export function buildAliasCandidates(modelId: string): readonly string[] {
  const seen = new Set<string>([modelId]);
  for (const prefix of KNOWN_PROVIDER_PREFIXES) {
    seen.add(`${prefix}/${modelId}`);
  }
  const slash = modelId.indexOf('/');
  if (slash !== -1) {
    const tail = modelId.slice(slash + 1);
    for (const prefix of KNOWN_PROVIDER_PREFIXES) {
      seen.add(`${prefix}/${tail}`);
    }
  }
  seen.delete(modelId);
  return [...seen];
}

// ---------------------------------------------------------------------------
// Bundled T2 loader — used by the global singleton only, injectable for tests
// ---------------------------------------------------------------------------

/** Path to the bundled generated registry. Test-only export. */
export function defaultGeneratedRegistryPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, 'model-registry.generated.json');
}

/**
 * Loads the bundled T2 registry synchronously. Returns `null` if the file
 * is missing or fails Zod validation — callers should treat null as "T2
 * unavailable" and fall through to T1 + T4. Logs but never throws.
 */
export function loadBundledGeneratedRegistry(
  path: string = defaultGeneratedRegistryPath(),
  logger?: ILogger
): GeneratedRegistry | null {
  const log = logger ?? createLogger({ component: 'capability-discovery' });
  if (!existsSync(path)) {
    log.warn('T2 generated registry file missing; falling back to T1 + T4', { path });
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    log.warn('T2 generated registry JSON parse failed; falling back to T1 + T4', {
      path,
      errorMessage: error.message,
    });
    return null;
  }
  const parsed = GeneratedRegistrySchema.safeParse(raw);
  if (!parsed.success) {
    log.warn('T2 generated registry schema validation failed; falling back to T1 + T4', {
      path,
      errorMessage: parsed.error.message,
    });
    return null;
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Global singleton
// ---------------------------------------------------------------------------

let globalDiscovery: CapabilityDiscovery | undefined;

/**
 * Global singleton. Lazily constructed on first access using the bundled T2
 * registry + canonical T1. Tests MUST call `setCapabilityDiscovery` with an
 * injected instance to avoid touching the real file.
 */
export function getCapabilityDiscovery(): CapabilityDiscovery {
  globalDiscovery ??= new CapabilityDiscovery({
    generated: loadBundledGeneratedRegistry(),
    overlay: loadCapabilityOverlay().entries,
    // Fail-closed default (#2177): unknown models get 8 K context and a
    // structured warn instead of the silent 200 K fall-through the legacy
    // getModelContextWindow used to return.
    conservativeDefault: FAIL_CLOSED_DEFAULT,
  });
  return globalDiscovery;
}

/** Test-only: inject a discovery instance. */
export function setCapabilityDiscovery(discovery: CapabilityDiscovery | undefined): void {
  globalDiscovery = discovery;
}
