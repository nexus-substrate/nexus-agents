/**
 * nexus-agents/mcp/tools — shared readiness-verdict envelope (#4096, epic #4094).
 *
 * The single authoritative shape for a multi-criterion "are we ready?" gate verdict.
 * Two independent readiness evaluators were carrying byte-identical copies of these
 * types — codepr-enable-readiness.ts (the OFF→on enable gate) and
 * improvement-enforce-readiness.ts (the shadow→enforce promotion gate). This DRYs the
 * envelope (the genuine shared shape) without forcing the evaluators to share anything
 * that actually differs between them.
 *
 * SCOPE — DELIBERATELY THE ENVELOPE ONLY. A code survey of all four corpus→score→verdict
 * sites (this pair plus pr-review-eval and the #4095 meta-strategy eval) confirmed the
 * corpus types, score functions, evidence shapes, and gate configs DIVERGE and must stay
 * per-consumer. Even the `presenceCriterion` helper is NOT shared: the two copies emit
 * different `detail` wording ("no {label}" vs "no named {label}") — a real domain
 * difference, so each evaluator keeps its own. Only the verdict envelope below is shared.
 * The full "labeled-corpus → score → verdict pipeline" extraction is deferred until a
 * third corpus-based gate demonstrates a unified shape (tracked separately under #4094).
 *
 * WARNING: do NOT route unrelated gates (code-quality, deploy-safety, …) through this
 * type just because they also yield a boolean. It models a readiness gate whose verdict
 * is "ready IFF every criterion is met". If your gate's verdict shape differs, define it
 * independently rather than over-coupling here.
 *
 * @module mcp/tools/readiness-verdict
 */

/** One checked condition of a readiness gate. */
export interface ReadinessCriterion {
  readonly name: string;
  readonly met: boolean;
  readonly detail: string;
}

/** A multi-criterion readiness verdict. `ready` is true IFF every criterion is met. */
export interface ReadinessVerdict {
  readonly ready: boolean;
  readonly criteria: readonly ReadinessCriterion[];
  /** Names of the unmet criteria (empty when ready). */
  readonly blockers: readonly string[];
}
