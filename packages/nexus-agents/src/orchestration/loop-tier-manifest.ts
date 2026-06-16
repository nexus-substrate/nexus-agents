/**
 * nexus-agents/orchestration - Loop-tier manifest schema + loader (#3843, ADR-0017).
 *
 * The authority ladder (ADR-0017) requires that EVERY automated behaviour — every
 * "loop" — declares HOW MUCH AUTHORITY its output carries (its
 * {@link AuthorityTier}). The eight routable execution *strategies* carry that
 * field on the strategy manifest (`strategy-manifest.ts`), and the #3841 gate
 * already polices them. But the ladder's `observe → suggest → advisory → enforce`
 * model also governs loops that are NOT routable strategies — MCP tools and
 * internal stages that act on their own schedule (e.g. `suggest_research_tasks`,
 * `improvement_review`, `pr_review`, the self-tuning loop). Those loops had NO
 * declaration surface; per the epic recon they sit at implicit tiers in scattered
 * defaults and prose.
 *
 * THIS module is that surface: a versioned, Zod-validated registry
 * (`governance/loop-tiers.yaml`, mirrored as a typed constant in
 * `loop-tier-registry.ts`) where each non-strategy loop declares its CURRENT tier
 * (#3843 is documentation + declaration — Scope Steward: zero behaviour change).
 * The #3841 CI gate (`check-authority-tier-drift.ts`, under `governance:check`)
 * reads this registry alongside the strategy manifests, so an undeclared loop
 * cannot ship and a dishonest `enforce` declaration fails the gate.
 *
 * MIRRORS the claims-registry / strategy-manifest pattern (versioned YAML + Zod
 * schema + embedded constant + lockstep test) so a reviewer reasons about all
 * three governance registries with the same mental model.
 *
 * THE `enforce` GRANDFATHER RULE. ADR-0017 §"enforce" says an `enforce` loop MUST
 * ship with an explicit, bounded *safety envelope*. There are two honest ways a
 * loop can be AT `enforce`:
 *   1. it was PROMOTED up the ladder, earning a floor-meeting promotion-evidence
 *      record (`governance/authority-tier-evidence.yaml`) + ratification — the
 *      strategy-manifest path the #3841 gate already enforces; or
 *   2. it is a PRE-EXISTING bounded `enforce` loop whose authority is justified by
 *      its declared safety envelope (floor / step-cap / decay), being declared at
 *      its CURRENT tier for the first time — NOT a promotion (no behaviour change).
 *
 * The tune loop is case (2): it has been default-ON bounded `enforce` since v2.96
 * (#3323), with a demotion-only floor (0.5), a per-step cap (0.2) and a 30-minute
 * linear decay (`core/tune-adjustment-store.ts`). Declaring it here records that
 * reality; it is NOT a ladder promotion and so carries a {@link LoopBoundedEnvelope}
 * (the safety envelope ADR-0017 mandates for `enforce`) rather than a
 * promotion-evidence record. A loop declared `enforce` MUST therefore supply a
 * `boundedEnvelope`; the gate fails an `enforce` loop with neither an envelope nor
 * a floor-meeting evidence record (an `enforce` default flip).
 *
 * @module orchestration/loop-tier-manifest
 * (Source: ADR-0017, Issue #3839, #3843)
 */

import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { AuthorityTierSchema } from './strategy-manifest.js';

/**
 * Bump when a backward-incompatible change to the loop-tier shape lands. The
 * loader rejects any document whose `schemaVersion` it does not understand, so a
 * stale declaration fails closed rather than being misread.
 */
export const LOOP_TIER_SCHEMA_VERSION = 1 as const;

/**
 * The bounded safety envelope an `enforce` loop ships with (ADR-0017 §"enforce":
 * "An `enforce` loop MUST ship with explicit bounds … and is subject to automatic
 * demotion on regression"). This is the declaration that JUSTIFIES a pre-existing
 * `enforce` loop's authority in lieu of a ladder-promotion evidence record — the
 * tune loop's exploration floor / step cap / decay window are the canonical case.
 *
 * `.strict()` so a typo'd bound fails validation rather than passing silently.
 */
export const LoopBoundedEnvelopeSchema = z
  .object({
    /**
     * Human description of WHAT the loop may do and the hard limit on it — the
     * one-line safety contract a reviewer reads. Non-empty.
     */
    summary: z.string().min(1),
    /**
     * The named, quantitative bounds (e.g. `{ demotionFloor: 0.5, maxStep: 0.2,
     * decayWindowMinutes: 30 }`). At least one bound; values are numbers so the
     * envelope is machine-readable, not prose. Keys are loop-specific.
     */
    bounds: z.record(z.string(), z.number()).refine((b) => Object.keys(b).length > 0, {
      message: 'a bounded envelope must declare at least one quantitative bound',
    }),
    /**
     * The src symbol(s) that define + enforce these bounds (e.g.
     * `core/tune-adjustment-store.ts:TUNE_DEMOTION_FLOOR`). The reviewer-checkable
     * anchor; non-empty.
     */
    enforcedBy: z.string().min(1),
    /**
     * What AUTOMATICALLY demotes the loop (ADR-0017 demotion is automatic on
     * regression). Non-empty: an `enforce` loop must say how it loses authority.
     */
    demotionTrigger: z.string().min(1),
  })
  .strict();
export type LoopBoundedEnvelope = z.infer<typeof LoopBoundedEnvelopeSchema>;

/**
 * One loop-tier declaration. `.strict()` so an unknown/typo'd field fails
 * validation rather than being silently ignored (same discipline as the strategy
 * manifest + claims registry).
 */
export const LoopTierManifestSchema = z
  .object({
    /** Stable kebab-case loop id; never reused (matches the loop's tool/stage id). */
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id must be kebab-case'),
    /** The manifest-shape version; must equal {@link LOOP_TIER_SCHEMA_VERSION}. */
    schemaVersion: z.literal(LOOP_TIER_SCHEMA_VERSION),
    /** One-line human description of what the loop does. Non-empty. */
    description: z.string().min(1),
    /** The loop's CURRENT authority tier (ADR-0017's `observe`→`enforce`). */
    authorityTier: AuthorityTierSchema,
    /**
     * The Phase-0 recon evidence (file:line) that this declaration matches the
     * loop's ACTUAL behaviour — the epic's "verifiable against the recon evidence"
     * acceptance criterion. Non-empty.
     */
    evidence: z.string().min(1),
    /**
     * The bounded safety envelope — REQUIRED when (and only when) `authorityTier`
     * is `enforce` (cross-checked by {@link LoopTierRegistrySchema}). ADR-0017
     * mandates explicit bounds for `enforce`; this is the declaration of them for
     * a pre-existing `enforce` loop declared at its current tier (not a promotion).
     */
    boundedEnvelope: LoopBoundedEnvelopeSchema.optional(),
    /**
     * The per-loop promotion-criteria doc (#3844) — where the evidence a promotion
     * out of this tier requires is written down. A repo-root-relative doc path.
     */
    promotionCriteriaDoc: z.string().min(1).optional(),
  })
  .strict();
export type LoopTierManifest = z.infer<typeof LoopTierManifestSchema>;

/**
 * The full versioned loop-tier registry document. Top-level `version` tracks the
 * registry CONTENTS revision (cf. the strategy/claims registries). Loop `id`s must
 * be unique, and every `enforce` loop MUST carry a `boundedEnvelope` (ADR-0017:
 * `enforce` is never unbounded). A `suggest`/`advisory`/`observe` loop must NOT
 * carry an envelope (the field is meaningless below `enforce`, and a stray one
 * would mislead a reviewer into thinking the loop acts).
 */
export const LoopTierRegistrySchema = z
  .object({
    version: z.number().int().positive(),
    loops: z
      .array(LoopTierManifestSchema)
      .min(1)
      .superRefine((loops, ctx) => {
        const seenIds = new Set<string>();
        for (const [i, loop] of loops.entries()) {
          if (seenIds.has(loop.id)) {
            ctx.addIssue({
              code: 'custom',
              message: `duplicate loop id '${loop.id}'`,
              path: [i, 'id'],
            });
          }
          seenIds.add(loop.id);

          if (loop.authorityTier === 'enforce' && loop.boundedEnvelope === undefined) {
            ctx.addIssue({
              code: 'custom',
              message: `loop '${loop.id}' is declared 'enforce' but has no boundedEnvelope — ADR-0017 requires explicit bounds for 'enforce'`,
              path: [i, 'boundedEnvelope'],
            });
          }
          if (loop.authorityTier !== 'enforce' && loop.boundedEnvelope !== undefined) {
            ctx.addIssue({
              code: 'custom',
              message: `loop '${loop.id}' is '${loop.authorityTier}' but carries a boundedEnvelope — an envelope is meaningful only at 'enforce'`,
              path: [i, 'boundedEnvelope'],
            });
          }
        }
      }),
  })
  .strict();
export type LoopTierRegistry = z.infer<typeof LoopTierRegistrySchema>;

/** Parse + validate a loop-tier registry from raw YAML text. Throws `ZodError`. */
export function parseLoopTierRegistry(yamlText: string): LoopTierRegistry {
  const raw: unknown = parseYaml(yamlText);
  return LoopTierRegistrySchema.parse(raw);
}

/**
 * Load + validate the loop-tier registry from disk. Fail-closed: a missing file
 * or a schema violation throws rather than returning a partial registry.
 * @throws if the file is missing or fails schema validation.
 */
export function loadLoopTierRegistry(registryPath: string): LoopTierRegistry {
  if (!existsSync(registryPath)) {
    throw new Error(`Loop-tier registry not found: ${registryPath}`);
  }
  return parseLoopTierRegistry(readFileSync(registryPath, 'utf-8'));
}
