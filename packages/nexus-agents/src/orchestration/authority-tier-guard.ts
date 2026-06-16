/**
 * nexus-agents/orchestration - Authority-tier enforcement guard (Epic D, #3841).
 *
 * The machine consumer the authority-ladder ratification panel required (ADR-0017,
 * #3839): the tier field is no longer "documentation dressed as architecture". This
 * module turns a manifest's declared {@link AuthorityTier} into an ENFORCED ceiling
 * on what a strategy may do.
 *
 * The contract (ADR-0017 §"The Four Tiers"): a strategy may take an action whose
 * authority class is AT OR BELOW its declared tier; an action ABOVE its declared
 * tier is REFUSED at the router (fail-closed), not caught after the fact. An
 * `advisory` strategy attempting an `enforce`-class action is refused here.
 *
 * Fail-closed on TWO axes:
 *  - an UNDECLARED tier (manifest with no `authorityTier`) permits NOTHING above
 *    `observe` — an undeclared loop cannot act. The CI gate (#3841,
 *    `check-authority-tier-drift.ts`) makes a declaration mandatory at build time;
 *    this is the runtime backstop if one slips through.
 *  - any action class strictly above the declared tier is refused.
 *
 * The tier→permitted-action mapping is EXPLICIT and pure ({@link permitsAction})
 * so it is unit-testable in isolation from the router.
 *
 * @module orchestration/authority-tier-guard
 * (Source: ADR-0017, Issue #3839, #3841)
 */

import type { ExecutionStrategy } from './meta-orchestrator.js';
import { getStrategyManifest } from './strategy-manifest-registry.js';
import type { AuthorityTier } from './strategy-manifest.js';

/**
 * The authority classes an action can carry, ordered least→most authoritative —
 * the SAME ordering as {@link AuthorityTier}. An action's class is the authority
 * it EXERCISES; a strategy's tier is the authority it is PERMITTED. The guard
 * refuses when the former exceeds the latter.
 *
 * Kept as its own enum (rather than reusing AuthorityTier) so the two roles read
 * distinctly at call sites — `guardAuthority(strategy, 'enforce')` says "this is an
 * enforce-class action", not "this strategy is enforce-tier".
 */
export const ACTION_CLASSES = ['observe', 'suggest', 'advisory', 'enforce'] as const;
export type ActionClass = (typeof ACTION_CLASSES)[number];

/**
 * The tier/action ordering as a rank map (index in the least→most array). The two
 * vocabularies share an ordering by construction — {@link ACTION_CLASSES} mirrors
 * the `AuthorityTierSchema` enum order — so a single rank table serves both.
 */
const RANK: Readonly<Record<ActionClass, number>> = Object.freeze(
  Object.fromEntries(ACTION_CLASSES.map((c, i) => [c, i])) as Record<ActionClass, number>
);

/**
 * Numeric rank of a tier or action class (least authoritative = 0).
 *
 * {@link AuthorityTier} and {@link ActionClass} are structurally identical (same
 * string members, same order) — they are kept as distinct type aliases for
 * call-site READABILITY (a tier is a permission, an action class is an exercise),
 * but a single rank table serves both. The param is typed `ActionClass` because
 * the two are mutually assignable.
 */
export function authorityRank(level: ActionClass): number {
  return RANK[level];
}

/**
 * The explicit tier→permitted-action predicate (ADR-0017 §"The Four Tiers").
 * `true` iff a strategy DECLARED at `declaredTier` may take an `actionClass`-class
 * action — i.e. the action's authority is at or below the declared ceiling.
 *
 * An UNDECLARED tier (`undefined`) is fail-closed to the floor: it permits only
 * `observe`-class actions (signal only). This is the runtime mirror of the CI
 * gate's "every registered manifest must declare a tier".
 */
export function permitsAction(
  declaredTier: AuthorityTier | undefined,
  actionClass: ActionClass
): boolean {
  // Fail-closed: an undeclared tier acts as the lowest rung (`observe`).
  const ceiling = declaredTier === undefined ? 0 : authorityRank(declaredTier);
  return authorityRank(actionClass) <= ceiling;
}

/** Why an authority guard refused. */
export type AuthorityRefusalCode = 'above_declared_tier' | 'tier_undeclared';

/**
 * Typed, structured refusal an authority guard produces when a strategy would act
 * above its declared tier. Mirrors {@link MetaDispatchError}'s shape (code +
 * strategy + message) so the dispatch/routing layer reasons about both failures
 * with one mental model. It is an `Error` so it can be thrown at the dispatch
 * boundary, but the pure {@link evaluateAuthority} path returns it as data so the
 * router can refuse without exceptions.
 */
export class AuthorityRefusalError extends Error {
  readonly code: AuthorityRefusalCode;
  readonly strategy: ExecutionStrategy;
  /** The tier the strategy's manifest declared (undefined ⇒ none declared). */
  readonly declaredTier: AuthorityTier | undefined;
  /** The authority class of the action that was refused. */
  readonly attemptedAction: ActionClass;

  constructor(args: {
    readonly code: AuthorityRefusalCode;
    readonly strategy: ExecutionStrategy;
    readonly declaredTier: AuthorityTier | undefined;
    readonly attemptedAction: ActionClass;
    readonly message: string;
  }) {
    super(args.message);
    this.name = 'AuthorityRefusalError';
    this.code = args.code;
    this.strategy = args.strategy;
    this.declaredTier = args.declaredTier;
    this.attemptedAction = args.attemptedAction;
  }
}

/** The outcome of an authority evaluation: permitted, or a typed refusal. */
export type AuthorityDecision =
  | { readonly permitted: true; readonly declaredTier: AuthorityTier }
  | { readonly permitted: false; readonly refusal: AuthorityRefusalError };

/**
 * Pure authority evaluation (no throw). Resolves the strategy's declared tier from
 * the manifest registry and decides whether an `actionClass`-class action is
 * permitted. Returns a structured {@link AuthorityDecision} so a caller (the
 * router) can refuse as data; {@link guardAuthority} is the throwing variant for
 * the dispatch boundary.
 *
 * Fail-closed:
 *  - no manifest / no declared tier ⇒ refuse with `tier_undeclared` (only the
 *    `observe` floor would pass, but an undeclared loop should never reach here
 *    once the CI gate is live — this is the backstop).
 *  - action class above the declared tier ⇒ refuse with `above_declared_tier`.
 */
export function evaluateAuthority(
  strategy: ExecutionStrategy,
  actionClass: ActionClass
): AuthorityDecision {
  const manifest = getStrategyManifest(strategy);
  const declaredTier = manifest?.authorityTier;

  if (declaredTier === undefined) {
    // An observe-class action is signal-only and always allowed; anything above it
    // from an undeclared loop is refused fail-closed.
    if (authorityRank(actionClass) === 0) {
      return { permitted: true, declaredTier: 'observe' };
    }
    return {
      permitted: false,
      refusal: new AuthorityRefusalError({
        code: 'tier_undeclared',
        strategy,
        declaredTier: undefined,
        attemptedAction: actionClass,
        message:
          `Strategy '${strategy}' has no declared authorityTier but attempted an ` +
          `'${actionClass}'-class action. Fail-closed refusal (ADR-0017): declare a ` +
          `tier in governance/strategy-manifests.yaml.`,
      }),
    };
  }

  if (permitsAction(declaredTier, actionClass)) {
    return { permitted: true, declaredTier };
  }

  return {
    permitted: false,
    refusal: new AuthorityRefusalError({
      code: 'above_declared_tier',
      strategy,
      declaredTier,
      attemptedAction: actionClass,
      message:
        `Strategy '${strategy}' is declared authorityTier='${declaredTier}' but attempted ` +
        `an '${actionClass}'-class action, which is above its tier. Refused fail-closed ` +
        `(ADR-0017): promotion requires an evidence record + ratification, not a default flip.`,
    }),
  };
}

/**
 * Throwing variant for the dispatch boundary. Returns void when the action is
 * permitted; throws the typed {@link AuthorityRefusalError} when it is refused.
 * Use this where an above-tier action must hard-stop (the run/dispatch path);
 * use {@link evaluateAuthority} where the router refuses as a structured decision.
 */
export function guardAuthority(strategy: ExecutionStrategy, actionClass: ActionClass): void {
  const decision = evaluateAuthority(strategy, actionClass);
  if (!decision.permitted) {
    throw decision.refusal;
  }
}
