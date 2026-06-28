/**
 * Code-PR adapter enable-readiness DOUBLE-GATE (#3670, Stage 2 — OFF).
 *
 * Mirrors {@link evaluateEnforceReadiness} (the shadow→enforce exit criterion):
 * a fixed set of FALSIFIABLE, independently-checkable conditions, ALL required
 * (fail-closed — any unmet condition blocks enabling the autonomous push path).
 *
 * The point of the double-gate: the raw OFF→on flag ALONE can NEVER activate the
 * push path. `ready: true` additionally requires a recorded enable-vote ref, a
 * guards-green soak (N consecutive dry-run plans with zero guard denials), AND a
 * named owner acknowledgement. A flag flip without the vote/soak/owner stays
 * `ready: false`.
 *
 * This module is PURE and DETERMINISTIC: it derives nothing from model output,
 * reads NO environment (the flag is passed in as a boolean — keeping it pure and
 * testable), performs NO I/O, flips NO flag, and runs NO push. Stage 3 (the
 * actual scoped-token push behind the enable-vote) MUST call this and refuse to
 * push unless it returns `ready: true`.
 *
 * @module mcp/tools/codepr-enable-readiness
 */

// @export-no-consumer-yet — see #3670 (the enable double-gate is consumed by the
// Stage-3 push, which is NOT wired yet. Stage 2.5 (#3670) now PRODUCES this gate's
// `guards-green-soak` evidence via codepr-soak-store; `evaluateCodePrEnableReadiness`
// itself stays without a runtime caller until Stage 3 wires the push behind it.)

import { z } from 'zod';

import type { ReadinessCriterion, ReadinessVerdict } from './readiness-verdict.js';

/**
 * Tuning for {@link evaluateCodePrEnableReadiness}. Conservative, fail-closed
 * defaults: enabling an autonomous push path is high-stakes, so the soak bar is
 * non-trivial and both the vote ref and owner sign-off are required.
 */
export const CodePrEnableReadinessConfigSchema = z
  .object({
    /**
     * Minimum number of CONSECUTIVE dry-run plans observed with ZERO guard
     * denials before the push path may be considered. The soak proves the
     * orchestrator + guards behave on real change sets before any push.
     */
    minGuardsGreenSoak: z.number().int().positive().default(50),
    /** Whether a recorded enable-vote ref is required (analogous to ratificationVoteRef). */
    requireEnableVoteRef: z.boolean().default(true),
    /** Whether a named owner acknowledgement is required. */
    requireOwnerAck: z.boolean().default(true),
  })
  .strict();
export type CodePrEnableReadinessConfig = z.infer<typeof CodePrEnableReadinessConfigSchema>;

/** Documented, conservative defaults (high bar, fail-closed). */
export const DEFAULT_CODEPR_ENABLE_READINESS_CONFIG: Readonly<CodePrEnableReadinessConfig> =
  Object.freeze(CodePrEnableReadinessConfigSchema.parse({}));

/**
 * The deterministic evidence the enable double-gate is evaluated against. NO
 * field is model-derived; every value is a realized operational fact the caller
 * supplies. Zod-validated so a malformed evidence object fails closed.
 */
export const CodePrEnableReadinessEvidenceSchema = z
  .object({
    /**
     * The explicit OFF→on flag. Passed in as a boolean (NOT read from env here —
     * this module stays pure). This is the FLAG half of the double-gate: true
     * alone is necessary but NEVER sufficient.
     */
    flagEnabled: z.boolean(),
    /**
     * A recorded enable-vote ref (analogous to a ratification vote ref). The
     * VOTE half of the gate: a non-empty string is required when
     * `requireEnableVoteRef` is set. Whitespace-only counts as absent.
     */
    enableVoteRef: z.string().default(''),
    /**
     * Count of CONSECUTIVE dry-run plans observed with zero guard denials (the
     * guards-green soak). Compared against `minGuardsGreenSoak`.
     */
    consecutiveGreenDryRuns: z.number().int().nonnegative().default(0),
    /**
     * Named owner accepting activation of the push path (the OWNER half of the
     * gate). Required when `requireOwnerAck` is set. Whitespace-only = absent.
     */
    owner: z.string().default(''),
  })
  .strict();
export type CodePrEnableReadinessEvidence = z.infer<typeof CodePrEnableReadinessEvidenceSchema>;

/**
 * One checked condition of the enable gate. Alias of the shared
 * {@link ReadinessCriterion} envelope (#4096) — kept as a named re-export so existing
 * consumers of this name are unaffected.
 */
export type CodePrReadinessCriterion = ReadinessCriterion;

/**
 * Full enable-readiness verdict. `ready` is true IFF every criterion is met. Alias of
 * the shared {@link ReadinessVerdict} envelope (#4096).
 */
export type CodePrEnableReadiness = ReadinessVerdict;

/** Build a "named X present" criterion, keeping the main fn flat. */
function presenceCriterion(
  name: string,
  label: string,
  value: string,
  required: boolean
): CodePrReadinessCriterion {
  const present = value !== '';
  return {
    name,
    met: !required || present,
    detail: present ? `${label}: ${value}` : `no ${label}`,
  };
}

/** Build the four ordered enable-gate criteria from validated evidence + config. */
function buildCriteria(
  ev: CodePrEnableReadinessEvidence,
  cfg: CodePrEnableReadinessConfig
): CodePrReadinessCriterion[] {
  const voteRef = ev.enableVoteRef.trim();
  const owner = ev.owner.trim();
  return [
    {
      name: 'flag-enabled',
      met: ev.flagEnabled,
      detail: ev.flagEnabled ? 'OFF→on flag is set' : 'OFF→on flag is not set',
    },
    {
      name: 'enable-vote-ref',
      met: !cfg.requireEnableVoteRef || voteRef !== '',
      detail: voteRef !== '' ? `enable-vote ref: ${voteRef}` : 'no enable-vote ref',
    },
    {
      name: 'guards-green-soak',
      met: ev.consecutiveGreenDryRuns >= cfg.minGuardsGreenSoak,
      detail: `${String(ev.consecutiveGreenDryRuns)} consecutive green dry-runs (need ≥ ${String(cfg.minGuardsGreenSoak)})`,
    },
    presenceCriterion('owner-ack', 'owner', owner, cfg.requireOwnerAck),
  ];
}

/** A single-blocker fail-closed verdict (malformed evidence/config). */
function failClosed(name: string, detail: string): CodePrEnableReadiness {
  return { ready: false, criteria: [{ name, met: false, detail }], blockers: [name] };
}

/**
 * Evaluate whether the code-PR autonomous push path may be enabled. Pure and
 * deterministic; supply the realized evidence. Returns `ready: true` ONLY when
 * ALL criteria hold — the flag ALONE can never make it ready:
 *
 *  1. **flag-enabled** — the explicit OFF→on flag is set;
 *  2. **enable-vote-ref** — a recorded enable-vote ref is present (non-empty);
 *  3. **guards-green-soak** — `consecutiveGreenDryRuns >= minGuardsGreenSoak`;
 *  4. **owner-ack** — a named owner accepts activation.
 *
 * On a malformed evidence object the function fails closed (`ready: false` with
 * an `evidence-shape` blocker) rather than throwing — an unparseable gate input
 * must never be read as "ready".
 *
 * Stage 3 (the push) MUST call this and refuse to push unless `ready === true`.
 */
export function evaluateCodePrEnableReadiness(
  evidence: CodePrEnableReadinessEvidence,
  config: CodePrEnableReadinessConfig = DEFAULT_CODEPR_ENABLE_READINESS_CONFIG
): CodePrEnableReadiness {
  const parsedEvidence = CodePrEnableReadinessEvidenceSchema.safeParse(evidence);
  if (!parsedEvidence.success) {
    return failClosed('evidence-shape', 'malformed enable-readiness evidence (fail-closed)');
  }
  const parsedConfig = CodePrEnableReadinessConfigSchema.safeParse(config);
  if (!parsedConfig.success) {
    return failClosed('config-shape', 'malformed enable-readiness config (fail-closed)');
  }

  const criteria = buildCriteria(parsedEvidence.data, parsedConfig.data);
  const blockers = criteria.filter((c) => !c.met).map((c) => c.name);
  return { ready: blockers.length === 0, criteria, blockers };
}
