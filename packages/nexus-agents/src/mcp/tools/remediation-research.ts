/**
 * Research adapter for the auto-remediation enforce path (#3540 phase 3 / #3648).
 *
 * The RESEARCH-phase `AutoRemediationDeps.research` implementation. v1 builds a
 * STRICT, TYPED {@link RemediationPlan} deterministically from the signal's own
 * typed fields, preserving bounded signal context and evidence (#7429) — it performs
 * NO fresh untrusted read, so the RESEARCH phase's untrusted-input capability isn't
 * even exercised (the safest possible research step). The actual implementation
 * reasoning happens downstream in the dev-pipeline's plan→vote→QA stages, which
 * operate on this typed plan via the #3643 `researchOverride` (so no untrusted
 * content ever reaches the write phase).
 *
 * Because the plan is derived only from the internal signal (never from external
 * text), there is no external injection surface here. Retained context is bounded
 * and strictly validated at the boundary. A future increment may enrich this
 * with a real (untrusted-read, RESEARCH-phase) diagnosis behind the
 * CapabilityLedger; the deterministic version is the safe default.
 *
 * @module mcp/tools/remediation-research
 */

import type { ImprovementSignal, SignalCategory } from './improvement-review.js';
import {
  type RemediationPlan,
  type RemediationActionKind,
  type RemediationSourceContext,
  type RemediationSourceEvidence,
  computeSourceContextDigest,
} from './improvement-remediation-capability.js';

/** The primary remediation action implied by a signal category. */
const ACTION_BY_CATEGORY: Readonly<Record<SignalCategory, RemediationActionKind>> = {
  routing: 'adjust-routing',
  bug: 'fix-bug',
  'tech-debt': 'refactor',
  security: 'investigate', // conservative — security is p0/unanimous-gated regardless
  consensus: 'investigate',
  // #3852: a deprecation/consolidation candidate is a human decision, never an
  // autonomous code change — investigate only (Epic D ratification path).
  'tool-fitness': 'investigate',
  // #3692/#3246: a perf regression needs root-cause diagnosis before any change —
  // investigate only; the surfaced signal never auto-applies a fix.
  'perf-regression': 'investigate',
};

/** Bound a string to a schema-safe length. */
function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function finiteOrUndefined(n: unknown): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/** Normalize signal evidence into strict bounded fields (#7429). */
function normalizeEvidence(
  evidence: ImprovementSignal['evidence'] | undefined
): RemediationSourceEvidence | undefined {
  if (evidence === undefined) return undefined;
  const result: {
    samples?: number;
    window?: string;
    observedValue?: number;
    threshold?: number;
  } = {};
  const samples = finiteOrUndefined(evidence.samples);
  if (samples !== undefined) result.samples = samples;
  const observedValue = finiteOrUndefined(evidence.observedValue);
  if (observedValue !== undefined) result.observedValue = observedValue;
  const threshold = finiteOrUndefined(evidence.threshold);
  if (threshold !== undefined) result.threshold = threshold;
  if (typeof evidence.window === 'string' && evidence.window.length > 0) {
    result.window = clip(evidence.window, 200);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Build a strict typed {@link RemediationPlan} from a signal — deterministic, no
 * untrusted read. Retains bounded source context and evidence (#7429). Always:
 * investigate → category-specific action → add a regression test. The result passes
 * `parseRemediationPlan` by construction.
 */
export function buildRemediationPlanFromSignal(signal: ImprovementSignal): RemediationPlan {
  const description =
    typeof signal.body === 'string' && signal.body.length > 0 ? clip(signal.body, 1200) : undefined;
  const evidence = normalizeEvidence(signal.evidence);

  let sourceContext: RemediationSourceContext | undefined;
  if (description !== undefined || evidence !== undefined) {
    const ctx: RemediationSourceContext = {
      ...(description !== undefined ? { description } : {}),
      ...(evidence !== undefined ? { evidence } : {}),
    };
    ctx.digest = computeSourceContextDigest(description, evidence);
    sourceContext = ctx;
  }

  return {
    signalKey: signal.signalKey,
    category: signal.category,
    summary: clip(`Remediate the surfaced signal: ${signal.title}`, 1000),
    steps: [
      {
        kind: 'investigate',
        description: clip(`Diagnose the root cause behind "${signal.title}".`, 500),
      },
      {
        kind: ACTION_BY_CATEGORY[signal.category],
        description: clip(
          `Address the ${signal.category} issue per the signal's evidence; keep the change minimal.`,
          500
        ),
      },
      {
        kind: 'add-test',
        description: 'Add a regression test that fails without the fix and passes with it.',
      },
    ],
    ...(sourceContext !== undefined ? { sourceContext } : {}),
  };
}
