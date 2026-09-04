/**
 * nexus-agents/config - Memory Configuration Schemas
 *
 * Zod schema for the `memory:` section of nexus-agents.yaml.
 *
 * Today the only sub-section that reaches runtime is `memory.decay`, which
 * feeds `MemoryDecayManager` (mcp/tools/memory-decay.ts). Before #5097 that
 * manager was constructed with a hardcoded `{}`, so its nine knobs were
 * permanently default and `enabled: false` was reachable only from a test.
 *
 * Deliberately carries NO defaults of its own: `DEFAULT_DECAY_CONFIG` in
 * memory-decay.ts is the single authority, and a second copy here would drift
 * from it silently. Every field is optional; the manager overlays whatever is
 * present on its defaults.
 *
 * @module config/schemas-memory
 * (Source: Issue #5097 finding 2 - wire the decay config)
 */

import { z } from 'zod';

/** Unit-interval score threshold. */
const unitInterval = z.number().min(0).max(1);

/** Smallest accepted `decayIntervalMs` — sweeps are not re-entrant (see field JSDoc). */
export const MIN_DECAY_INTERVAL_MS = 1000;

/**
 * Coordinated memory decay configuration.
 *
 * Maps 1:1 onto `MemoryDecayConfig` in mcp/tools/memory-decay.ts — a test
 * pins the key sets equal so a new knob cannot be silently unconfigurable.
 * `.int()` under zod 4 already rejects unsafe integers, so every count and
 * duration below is bounded to `Number.MAX_SAFE_INTEGER`.
 */
export const MemoryDecayConfigSchema = z.object({
  /** Whether decay runs at all (default: true) */
  enabled: z.boolean().optional(),

  /**
   * Interval between automatic decay runs in ms (default: 1 hour).
   * Floor: {@link MIN_DECAY_INTERVAL_MS}. `runDecay` has no re-entrancy
   * guard, so a sub-second cadence invites overlapping sweeps over the same
   * stores; 1000 ms is the smallest value at which that is implausible.
   */
  decayIntervalMs: z.number().int().min(MIN_DECAY_INTERVAL_MS).optional(),

  /** Age in days before superseded beliefs are pruned (default: 30) */
  beliefMaxAgeDays: z.number().int().positive().optional(),

  /** Agentic entries before importance-based eviction starts (default: 10000) */
  agenticMaxEntries: z.number().int().positive().optional(),

  /** Importance below which agentic entries are evicted, 0-1 (default: 0.3) */
  agenticImportanceThreshold: unitInterval.optional(),

  /** Priority score below which adaptive entries are evicted, 0-1 (default: 0.2) */
  adaptivePriorityThreshold: unitInterval.optional(),

  /** Run MobiMem TTL eviction on each coordinated decay (default: true) */
  mobimemEvictOnDecay: z.boolean().optional(),

  /** Check cross-references before evicting (default: true) */
  checkCrossReferences: z.boolean().optional(),

  /** Grace period in ms before removing cross-referenced items (default: 7 days) */
  crossReferenceGracePeriodMs: z.number().int().nonnegative().optional(),
});

export type MemoryDecayConfigInput = z.infer<typeof MemoryDecayConfigSchema>;

/**
 * `memory:` section of nexus-agents.yaml.
 */
export const MemoryConfigSchema = z.object({
  /** Coordinated decay knobs (#5097) */
  decay: MemoryDecayConfigSchema.optional(),
});

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;
