/**
 * nexus-agents/orchestration - Strategy Manifest schema + loader.
 *
 * The strategy-manifest registry (`governance/strategy-manifests.yaml`) is the
 * single source of truth describing each routable execution strategy: which
 * engine fronts it, whether it has a wired executor, when to force it, and the
 * forward-compat governance (authority tier — Epic D) and cost (Epic G) fields.
 * The MetaOrchestrator routes purely over manifest data — adding a capability
 * becomes "register a manifest", not "edit the router" (Epic C, #3833).
 *
 * This module owns ONLY the schema + loader/validator (child #3834). It MIRRORS
 * the claims-registry pattern (versioned YAML + Zod schema + loader + Vitest) so
 * a reviewer reasons about both with the same mental model.
 *
 * Explicitly deferred to siblings:
 * - #3835: migrating the 8 live strategies (`STRATEGY_ENTRYPOINT_TOOL`,
 *   run-tool.ts) to registered manifests + the behaviour-parity golden test.
 * - #3836: the router refactor that consumes these manifests instead of the
 *   hardcoded `decideStrategy` rules.
 * - #3837: drift-gating the registry under `governance:check`.
 *
 * @module orchestration/strategy-manifest
 * (Source: Issue #3833, #3834)
 */

import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { ExecutionStrategy } from './meta-orchestrator.js';

/**
 * Bump when a backward-incompatible change to the manifest shape lands. The
 * loader rejects any document whose `schemaVersion` it does not understand, so a
 * stale manifest fails closed at startup rather than routing on a misread shape.
 */
export const STRATEGY_MANIFEST_SCHEMA_VERSION = 1 as const;

/**
 * The execution strategies the MetaOrchestrator can select today, as a runtime
 * `as const` tuple. This is the SINGLE enumerable source the manifest schema and
 * the lockstep test both derive from — it gives `ExecutionStrategy` (a pure TS
 * union with no runtime value to enumerate) a runtime mirror.
 *
 * LOCKSTEP IS COMPILE-TIME ENFORCED: {@link assertExecutionStrategyLockstep}
 * below asserts this tuple's element type is mutually assignable with the router
 * `ExecutionStrategy` union. If someone ADDS a member to `ExecutionStrategy`
 * without adding it here (or vice-versa), that assertion fails to typecheck —
 * closing the #3881 hole where an added strategy could drift in undetected.
 */
export const EXECUTION_STRATEGY_NAMES = [
  'single-shot',
  'dev-pipeline',
  'pipeline',
  'graph-workflow',
  'orchestrate',
  'consensus',
  'spec',
  'research',
] as const;

/**
 * Compile-time exhaustiveness guard for the #3881 lockstep promise. `expect`
 * yields `never` only when its two type args are MUTUALLY assignable, so:
 * - adding a member to `ExecutionStrategy` (router) without adding it to
 *   {@link EXECUTION_STRATEGY_NAMES} ⇒ `ExecutionStrategy` no longer extends the
 *   tuple union ⇒ `never` resolves to `false` ⇒ TYPE ERROR.
 * - adding a member here without it existing on the router ⇒ symmetric TYPE
 *   ERROR.
 * Purely a type-level assertion — erased at runtime, zero cost.
 */
type Expect<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type _AssertExecutionStrategyLockstep = Expect<
  (typeof EXECUTION_STRATEGY_NAMES)[number],
  ExecutionStrategy
>;
// If this line errors, EXECUTION_STRATEGY_NAMES has drifted from the router
// ExecutionStrategy union — reconcile the two (that is the #3881 guarantee).
const _executionStrategyLockstepHolds: _AssertExecutionStrategyLockstep = true;
void _executionStrategyLockstepHolds;

/**
 * The execution strategies as a Zod enum, derived from
 * {@link EXECUTION_STRATEGY_NAMES} so the schema and the lockstep guard share one
 * source. #3835 registers one manifest per member.
 */
export const StrategyNameSchema = z.enum(EXECUTION_STRATEGY_NAMES);
export type StrategyName = z.infer<typeof StrategyNameSchema>;

/**
 * Authority tier (Epic D, #3552). Declares HOW MUCH AUTHORITY a strategy's
 * output carries in the governed action path. The field lands now (#3834) so
 * manifests can be authored against it; ENFORCEMENT lands in Epic D. Ordered
 * least→most authoritative:
 * - `observe`: produces signal only; never acts.
 * - `suggest`: proposes; a human/governor must approve before any action.
 * - `advisory`: acts in low-stakes paths; gated in high-stakes ones.
 * - `enforce`: may take governed action directly (the promotion target #3552
 *   gates into).
 */
export const AuthorityTierSchema = z.enum(['observe', 'suggest', 'advisory', 'enforce']);
export type AuthorityTier = z.infer<typeof AuthorityTierSchema>;

/**
 * The authority tiers in least→most order — the single ordered source the
 * enforcement guard ({@link AuthorityTier} ranks) and the CI gate's per-tier
 * floors both derive from. Mirrors the `AuthorityTierSchema` enum order.
 */
export const AUTHORITY_TIERS = ['observe', 'suggest', 'advisory', 'enforce'] as const;

/**
 * Promotion-evidence record schema (ADR-0017 §"Evidence-Threshold Schema",
 * #3841). The concrete, machine-checkable tuple a promotion is earned against.
 * Deliberately small + quantitative so a GATE — not a reviewer's judgment —
 * decides whether a threshold is met. The #3841 CI gate
 * (`check-authority-tier-drift.ts`) validates a manifest declared at a promoted
 * tier (`advisory`/`enforce`) against a matching record meeting the per-tier
 * floor; #3842 wires the linked tier-transition audit event.
 *
 * `.strict()` so a typo'd field fails validation rather than passing silently.
 */
export const PromotionEvidenceSchema = z
  .object({
    /** The loop/strategy being promoted (manifest `id`). */
    loopId: z.string().min(1),
    /** Current tier before promotion. */
    fromTier: AuthorityTierSchema,
    /** Target tier; must be exactly one step up (checked by the gate). */
    toTier: AuthorityTierSchema,
    /** Number of independent, judged evaluations behind the metric. */
    evalN: z.number().int().nonnegative(),
    /** Precision on judged output (0–1); required for advisory+ promotions. */
    precision: z.number().min(0).max(1).optional(),
    /** Recall (0–1); required for enforce promotions (missed-action cost). */
    recall: z.number().min(0).max(1).optional(),
    /** The loop-specific promotion metric: name, value, and CI bounds. */
    primaryMetric: z
      .object({
        name: z.string().min(1),
        value: z.number(),
        ci: z.tuple([z.number(), z.number()]),
      })
      .strict(),
    /** ISO-8601 duration of soak at the lower tier with no intervention. */
    soakDuration: z.string().regex(/^P/, 'soakDuration must be an ISO-8601 duration (e.g. P30D)'),
    /** Confounders the primaryMetric controls for. */
    controlledFor: z.array(z.string()).optional(),
    /** The recorded consensus_vote ref that ratifies the promotion. */
    ratificationVote: z.string().min(1),
    /** Link to the measurement surface / report that produced the numbers. */
    evidenceUri: z.string().min(1),
  })
  .strict();
export type PromotionEvidence = z.infer<typeof PromotionEvidenceSchema>;

/** The versioned promotion-evidence ledger document (#3841). */
export const PromotionEvidenceLedgerSchema = z
  .object({
    version: z.number().int().positive(),
    evidence: z.array(PromotionEvidenceSchema),
  })
  .strict();
export type PromotionEvidenceLedger = z.infer<typeof PromotionEvidenceLedgerSchema>;

/**
 * Expected latency class — reuses the #3734 operation-class taxonomy
 * (`OperationClassName` in `config/timeouts.ts`) so a manifest's latency
 * expectation is the SAME vocabulary the runaway-guard layer already speaks.
 * Declared independently here (no cross-module import in the schema) for the
 * same self-containment reason as {@link StrategyNameSchema}.
 */
export const LatencyClassSchema = z.enum([
  'interactive',
  'single-llm',
  'multi-llm-panel',
  'pipeline',
  'network-fetch',
  'async-job-body',
]);
export type LatencyClass = z.infer<typeof LatencyClassSchema>;

/**
 * Maturity tier — how battle-tested a strategy is. Routing/observability may
 * down-weight `experimental` strategies. Distinct from {@link AuthorityTier},
 * which is about permission, not proven-ness.
 */
export const MaturityTierSchema = z.enum(['experimental', 'beta', 'stable']);
export type MaturityTier = z.infer<typeof MaturityTierSchema>;

/**
 * Cost profile (Epic G). Placeholder vocabulary so manifests can be authored
 * with a coarse hint now; Epic G POPULATES real cost data and may extend this.
 * Optional on the manifest until Epic G lands.
 */
export const CostProfileSchema = z.enum(['low', 'medium', 'high', 'variable']);
export type CostProfile = z.infer<typeof CostProfileSchema>;

/**
 * Workflow patterns the router's structural classifier emits. Declared
 * independently here (no import of `workflow-router-types`) for the same
 * self-containment reason as {@link StrategyNameSchema}; a divergence is caught
 * by the registry test, which routes every live pattern through the matcher.
 */
export const WorkflowPatternSchema = z.enum([
  'sequential',
  'wave',
  'graph',
  'consensus',
  'aflow',
  'puppeteer',
]);

/**
 * Pipeline templates the classifier emits (mirrors `PipelineType` in
 * `pipeline/adaptive-orchestrator.ts`). Self-contained here for the same reason
 * as {@link WorkflowPatternSchema}.
 */
export const PipelineTypeSchema = z.enum(['dev', 'research', 'audit', 'greenfield', 'general']);

/**
 * Task-complexity tiers (mirrors `TaskAnalysisResult.complexity`). Used by a
 * selection rule's complexity gate so the sequential default can split between a
 * single-shot and a pipeline strategy purely from manifest data.
 */
export const ComplexityTierSchema = z.enum(['simple', 'moderate', 'complex', 'expert']);

/**
 * One declarative selection rule (#3836). A rule MATCHES when every predicate it
 * declares holds for the current routing signals; among all matching rules
 * across all manifests, the router picks the strategy whose matching rule has the
 * HIGHEST {@link priority} (ties broken deterministically by strategy name). This
 * is what lets the MetaOrchestrator route purely over manifest data: adding a
 * strategy means registering a manifest with its rules, not editing the router.
 *
 * `.strict()` so a typo'd predicate fails validation rather than matching
 * unexpectedly. At least one predicate must be present (a rule that matches every
 * signal would shadow the whole table) — enforced by {@link SelectionRuleSchema}.
 */
export const SelectionRuleSchema = z
  .object({
    /** Higher wins. Distinctive templates outrank the structural-pattern fallback. */
    priority: z.number().int(),
    /** Matches only when the routed workflow pattern is one of these. */
    patterns: z.array(WorkflowPatternSchema).min(1).optional(),
    /** Matches only when the classified pipeline template is one of these. */
    pipelineTypes: z.array(PipelineTypeSchema).min(1).optional(),
    /** Matches only when the analyzed complexity is one of these. */
    complexities: z.array(ComplexityTierSchema).min(1).optional(),
  })
  .strict()
  .refine((r) => r.patterns !== undefined || r.pipelineTypes !== undefined, {
    message: 'a selection rule must constrain at least patterns or pipelineTypes',
  });
export type SelectionRule = z.infer<typeof SelectionRuleSchema>;

/**
 * A single strategy manifest. `.strict()` so an unknown/typo'd field fails
 * validation rather than being silently ignored (same discipline as the claims
 * registry). Required fields model the current reality; the two forward-compat
 * governance/cost fields are optional so #3835 can register all 8 manifests
 * before Epic D/G populate them.
 */
export const StrategyManifestSchema = z
  .object({
    /**
     * Stable kebab-case identifier; never reused. For the initial 8 this equals
     * the strategy name, but `id` is a distinct field so future strategies can
     * carry a more specific id without colliding with the {@link StrategyName}
     * enum.
     */
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id must be kebab-case'),
    /**
     * The manifest-shape version this entry was authored against. Must equal
     * {@link STRATEGY_MANIFEST_SCHEMA_VERSION}; a mismatch fails closed so a
     * manifest written for a future shape is never misread.
     */
    schemaVersion: z.literal(STRATEGY_MANIFEST_SCHEMA_VERSION),
    /** The execution strategy this manifest describes (router enum). */
    strategy: StrategyNameSchema,
    /**
     * The concrete MCP tool / engine that fronts this strategy — the
     * force-strategy entry point (generalizes `STRATEGY_ENTRYPOINT_TOOL`,
     * run-tool.ts). Non-empty.
     */
    entrypointTool: z.string().min(1),
    /**
     * Whether a wired executor exists for this strategy (run-tool.ts
     * `buildDefaultExecutors`). FAIL-CLOSED routing key: only 4/8 are `true`
     * today (dev-pipeline, pipeline, research, consensus); the rest must declare
     * `false` so the router never selects an unexecutable strategy silently and
     * `execute:true` returns the structured `no_executor` envelope from manifest
     * data (#3835) instead of a hardcoded map.
     *
     * NOT trusted blindly: this self-declared boolean is CROSS-CHECKED against the
     * live `buildDefaultExecutors` key set in `strategy-manifest-registry.test.ts`
     * (#3881), so declaring `true` for a strategy with no wired executor (silent
     * fail-OPEN) fails the build rather than mis-advertising routability.
     */
    executorAvailable: z.boolean(),
    /** One-line human description of what this strategy is for (#3838 docs). */
    description: z.string().min(1),
    /**
     * Guidance on when to FORCE this strategy via `run({ forceStrategy })` —
     * the escape-hatch docs surfaced in #3838. Optional: the router selects by
     * capability; this is operator guidance, not a routing input.
     */
    whenToForce: z.string().min(1).optional(),
    /** Maturity tier; defaults are not assumed — author states it explicitly. */
    maturityTier: MaturityTierSchema,
    /** Expected latency class (#3734 taxonomy). */
    latencyClass: LatencyClassSchema,
    /**
     * Authority tier — FORWARD-COMPAT for Epic D (#3552). Optional until Epic D
     * enforcement lands; when present it must be a valid {@link AuthorityTier}.
     */
    authorityTier: AuthorityTierSchema.optional(),
    /**
     * Cost profile — FORWARD-COMPAT for Epic G. Optional until Epic G populates
     * real cost data; when present it must be a valid {@link CostProfile}.
     */
    costProfile: CostProfileSchema.optional(),
    /**
     * Declarative routing rules (#3836) — the data the manifest-driven router
     * matches over to SELECT this strategy. Optional: a manifest without rules is
     * still force-selectable via `entrypointTool` but is never auto-routed (it has
     * no claim on any signal). Each rule is a {@link SelectionRule}; the router
     * applies the highest-priority matching rule across the whole registry.
     */
    selectionRules: z.array(SelectionRuleSchema).min(1).optional(),
  })
  .strict();
export type StrategyManifest = z.infer<typeof StrategyManifestSchema>;

/**
 * The full versioned manifest-registry document. Top-level `version` tracks the
 * registry CONTENTS revision (cf. the claims registry); each manifest's
 * `schemaVersion` tracks the per-entry SHAPE. Both `id` and `strategy` must be
 * unique across the registry — a strategy is fronted by exactly one manifest.
 */
export const StrategyManifestRegistrySchema = z
  .object({
    version: z.number().int().positive(),
    manifests: z
      .array(StrategyManifestSchema)
      .min(1)
      .superRefine((manifests, ctx) => {
        const seenIds = new Set<string>();
        const seenStrategies = new Set<string>();
        for (const [i, m] of manifests.entries()) {
          if (seenIds.has(m.id)) {
            ctx.addIssue({
              code: 'custom',
              message: `duplicate manifest id '${m.id}'`,
              path: [i, 'id'],
            });
          }
          seenIds.add(m.id);
          if (seenStrategies.has(m.strategy)) {
            ctx.addIssue({
              code: 'custom',
              message: `duplicate strategy '${m.strategy}' (a strategy is fronted by exactly one manifest)`,
              path: [i, 'strategy'],
            });
          }
          seenStrategies.add(m.strategy);
        }
      }),
  })
  .strict();
export type StrategyManifestRegistry = z.infer<typeof StrategyManifestRegistrySchema>;

/** Parse + validate a single manifest from a plain object. Throws `ZodError`. */
export function parseStrategyManifest(raw: unknown): StrategyManifest {
  return StrategyManifestSchema.parse(raw);
}

/** Parse + validate a registry from raw YAML text. Throws `ZodError` on drift. */
export function parseStrategyManifestRegistry(yamlText: string): StrategyManifestRegistry {
  const raw: unknown = parseYaml(yamlText);
  return StrategyManifestRegistrySchema.parse(raw);
}

/**
 * Load + validate the manifest registry from disk. Fail-closed: a missing file
 * or a schema violation throws rather than returning a partial registry.
 * @throws if the file is missing or fails schema validation.
 */
export function loadStrategyManifestRegistry(registryPath: string): StrategyManifestRegistry {
  if (!existsSync(registryPath)) {
    throw new Error(`Strategy manifest registry not found: ${registryPath}`);
  }
  return parseStrategyManifestRegistry(readFileSync(registryPath, 'utf-8'));
}
