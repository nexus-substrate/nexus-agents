/**
 * Tool-fitness SignalCategory consumer for `improvement_review` (#3852, child of
 * epic #3850). This is the NAMED consumer of the #3851 tool-fitness ledger.
 *
 * Reads the per-tool fitness ledger ({@link ToolFitnessLedger.report}) and
 * surfaces two kinds of suggest-tier candidate:
 *
 * - **Deprecation candidates** — a tool with very low recent invocations AND/OR
 *   a poor success rate over a meaningful sample. "Pulling its weight" is judged
 *   by usage + reliability, never intuition.
 * - **Consolidation candidates** — tools whose names indicate an overlapping
 *   surface (a shared prefix family, e.g. `research_*`) where one member is far
 *   less used than its siblings, hinting it could fold into a sibling. (Richer
 *   tool-distinctness similarity data is a later seam; this is the honest,
 *   ledger-only heuristic for the first consumer.)
 *
 * ## EPIC F INVARIANT — NEVER autonomous removal
 *
 * Output is **SUGGEST-TIER ONLY**. Every signal this module produces is a
 * *candidate for human review*, NOT an instruction to prune. The strings are
 * deliberately worded as candidates, severity caps at `warning` (never
 * `critical`, which would escalate priority toward auto-remediation), and the
 * shared `improvement_review` contract keeps `fileIssues=false` by default with
 * a rate cap. Removal requires the Epic D human-ratification path (#3853
 * runbook). {@link assertNeverAutonomousRemoval} encodes this as a runtime
 * guard the tests assert against.
 *
 * ## Context-poisoning defense (#3852 concern 1)
 *
 * The ledger is homedir-global, so a tool that fails in ONE workspace would
 * otherwise aggregate into a single global number and mis-flag a tool that is
 * healthy everywhere else. Before flagging a low-success tool, this consumer
 * checks the per-workspace breakdown: if the tool is healthy in any OTHER
 * workspace, the failure is workspace-local and does NOT produce a global
 * deprecation signal (it is reported as workspace-scoped context instead). A
 * low-USAGE candidate is workspace-agnostic (usage is genuinely global), so
 * scoping applies to the success-rate dimension where poisoning actually bites.
 *
 * @module mcp/tools/improvement-review-tool-fitness
 * (Source: Issue #3852)
 */

import type { ImprovementSignal } from './improvement-review.js';
import {
  assertNeverAutonomousRemoval,
  consolidationConfidence,
  consolidationSignal,
  CONSOLIDATION_USAGE_FRACTION,
  FITNESS_MIN_SAMPLE,
  HEALTHY_WORKSPACE_SUCCESS_FLOOR,
  isNeverDeprecate,
  localizedReliabilitySignal,
  lowUsageSignal,
  LOW_USAGE_MAX_INVOCATIONS,
  poorReliabilitySignal,
  POOR_SUCCESS_RATE_MAX,
  type NeverDeprecateConfig,
} from './improvement-review-tool-fitness-heuristics.js';
import { isRegisteredToolName } from './tool-manifest.js';
import {
  getToolFitnessLedger,
  ToolFitnessLedger,
  UNATTRIBUTED_WORKSPACE,
  type ToolFitnessStat,
} from '../../governance/tool-fitness-ledger.js';

// Re-export the thresholds + Epic-F guard so existing consumers/tests keep their
// import surface (the constants & guard now live in the heuristics sibling so
// this consumer stays under the 400-line cap, #3902).
export {
  assertNeverAutonomousRemoval,
  CONSOLIDATION_USAGE_FRACTION,
  FITNESS_MIN_SAMPLE,
  HEALTHY_WORKSPACE_SUCCESS_FLOOR,
  LOW_USAGE_MAX_INVOCATIONS,
  POOR_SUCCESS_RATE_MAX,
};
export type { NeverDeprecateConfig };

// ============================================================================
// Pure detection logic (fixture-testable — no fs, no ledger I/O)
// ============================================================================

/**
 * True when `stat` is healthy in at least one workspace OTHER than the one(s)
 * dragging its global rate down — i.e. the poor global rate is workspace-local
 * context-poisoning, so it must NOT produce a global deprecation flag.
 *
 * Pure: takes a `statInWorkspace` resolver so it's testable without a ledger.
 */
export function isHealthyInAnyOtherWorkspace(
  stat: ToolFitnessStat,
  statInWorkspace: (tool: string, workspace: string) => ToolFitnessStat | undefined
): boolean {
  // Single (or zero) workspace → nothing to scope against; not poisoning.
  const realWorkspaces = stat.workspaces.filter((w) => w !== UNATTRIBUTED_WORKSPACE);
  if (realWorkspaces.length < 2) return false;
  return realWorkspaces.some((ws) => {
    const scoped = statInWorkspace(stat.tool, ws);
    return (
      scoped !== undefined &&
      scoped.invocationCount >= FITNESS_MIN_SAMPLE &&
      scoped.successRate >= HEALTHY_WORKSPACE_SUCCESS_FLOOR
    );
  });
}

/**
 * Workspaces where `stat` is genuinely failing LOCALLY (#3902 item 3): scoped
 * success rate at/under {@link POOR_SUCCESS_RATE_MAX} over a meaningful sample.
 * Used to surface a localized warning when the global flag is suppressed as
 * context-poisoning. Pure (resolver injected). Returns the failing scoped stats.
 */
export function locallyFailingWorkspaces(
  stat: ToolFitnessStat,
  statInWorkspace: (tool: string, workspace: string) => ToolFitnessStat | undefined
): readonly ToolFitnessStat[] {
  const realWorkspaces = stat.workspaces.filter((w) => w !== UNATTRIBUTED_WORKSPACE);
  const failing: ToolFitnessStat[] = [];
  for (const ws of realWorkspaces) {
    const scoped = statInWorkspace(stat.tool, ws);
    if (
      scoped !== undefined &&
      scoped.invocationCount >= FITNESS_MIN_SAMPLE &&
      scoped.successRate <= POOR_SUCCESS_RATE_MAX
    ) {
      failing.push(scoped);
    }
  }
  return failing;
}

/** Tool-name family = prefix before the first underscore (e.g. `research`). */
function toolFamily(tool: string): string | undefined {
  const idx = tool.indexOf('_');
  return idx > 0 ? tool.slice(0, idx) : undefined;
}

/** Group report stats by shared-prefix family (tools with no prefix dropped). */
function groupByFamily(report: readonly ToolFitnessStat[]): Map<string, ToolFitnessStat[]> {
  const families = new Map<string, ToolFitnessStat[]>();
  for (const stat of report) {
    const fam = toolFamily(stat.tool);
    if (fam === undefined) continue;
    const bucket = families.get(fam);
    if (bucket === undefined) families.set(fam, [stat]);
    else bucket.push(stat);
  }
  return families;
}

/** The busiest member of a non-empty family by invocation count. */
function busiestMember(members: readonly ToolFitnessStat[]): ToolFitnessStat {
  return members.reduce((best, m) => (m.invocationCount > best.invocationCount ? m : best));
}

/**
 * Consolidation candidates within ONE family (busiest already cleared the floor).
 * #3902: a shared prefix is only a WEAK hint — a member is dropped when its
 * action verb is clearly ORTHOGONAL to the busiest sibling's (e.g. `git_init`
 * vs `git_commit`, `db_read` vs `db_drop_table`), so a rare sibling is never
 * flagged for folding into a busy one on prefix alone. Survivors are emitted as
 * LOW-CONFIDENCE candidates (see {@link consolidationSignal}).
 */
function familyConsolidationSignals(
  members: readonly ToolFitnessStat[],
  family: string,
  busiest: ToolFitnessStat,
  windowLabel: string
): readonly ImprovementSignal[] {
  const cutoff = busiest.invocationCount * CONSOLIDATION_USAGE_FRACTION;
  return members
    .filter((m) => m.tool !== busiest.tool && m.invocationCount <= cutoff)
    .filter((m) => consolidationConfidence(m, busiest) !== 'none')
    .map((m) => consolidationSignal(m, family, busiest.tool, busiest.invocationCount, windowLabel));
}

/**
 * Detect consolidation candidates: within each shared-prefix family with >= 2
 * members where the busiest sibling clears the sample floor, flag members used
 * at/under {@link CONSOLIDATION_USAGE_FRACTION} of the busiest. Pure.
 */
export function detectConsolidationCandidates(
  report: readonly ToolFitnessStat[],
  windowLabel: string
): readonly ImprovementSignal[] {
  const signals: ImprovementSignal[] = [];
  for (const [family, members] of groupByFamily(report)) {
    if (members.length < 2) continue;
    const busiest = busiestMember(members);
    if (busiest.invocationCount < FITNESS_MIN_SAMPLE) continue;
    signals.push(...familyConsolidationSignals(members, family, busiest, windowLabel));
  }
  return signals;
}

/** Reliability signals for one stat: global poor-reliability OR localized failures. */
function reliabilitySignalsFor(
  stat: ToolFitnessStat,
  statInWorkspace: (tool: string, workspace: string) => ToolFitnessStat | undefined,
  windowLabel: string
): readonly ImprovementSignal[] {
  if (stat.invocationCount < FITNESS_MIN_SAMPLE || stat.successRate > POOR_SUCCESS_RATE_MAX) {
    return [];
  }
  // #3902 item 3: when healthy elsewhere, the global flag is suppressed BUT the
  // localized "failing here" warning still surfaces (don't fully silence it).
  if (isHealthyInAnyOtherWorkspace(stat, statInWorkspace)) {
    return locallyFailingWorkspaces(stat, statInWorkspace).map((scoped) =>
      localizedReliabilitySignal(
        scoped,
        scoped.workspaces[0] ?? UNATTRIBUTED_WORKSPACE,
        windowLabel
      )
    );
  }
  return [poorReliabilitySignal(stat, windowLabel)];
}

/**
 * Detect deprecation candidates (low usage OR poor reliability) from a fitness
 * report, scoping the reliability dimension by workspace to defeat
 * context-poisoning. #3902: low-usage break-glass tools are EXEMPT (item 2), and
 * a cross-workspace-suppressed failure still emits a workspace-scoped localized
 * signal (item 3). Pure: the `statInWorkspace` resolver is injected.
 */
export function detectDeprecationCandidates(
  report: readonly ToolFitnessStat[],
  statInWorkspace: (tool: string, workspace: string) => ToolFitnessStat | undefined,
  windowLabel: string,
  neverDeprecate?: NeverDeprecateConfig
): readonly ImprovementSignal[] {
  const signals: ImprovementSignal[] = [];
  for (const stat of report) {
    if (stat.invocationCount <= LOW_USAGE_MAX_INVOCATIONS) {
      // #3902 item 2: break-glass / never-deprecate tools are low-usage BY DESIGN.
      if (isNeverDeprecate(stat.tool, neverDeprecate)) continue;
      signals.push(lowUsageSignal(stat, windowLabel));
      continue; // low-usage already covers it; don't double-flag.
    }
    signals.push(...reliabilitySignalsFor(stat, statInWorkspace, windowLabel));
  }
  return signals;
}

/**
 * Full tool-fitness signal set from a report. Combines deprecation +
 * consolidation candidates. Pure (no ledger I/O) — used directly in fixture
 * tests; {@link loadToolFitnessSignals} wires it to the live ledger.
 */
export function detectToolFitnessSignals(
  report: readonly ToolFitnessStat[],
  statInWorkspace: (tool: string, workspace: string) => ToolFitnessStat | undefined,
  windowLabel: string,
  neverDeprecate?: NeverDeprecateConfig
): readonly ImprovementSignal[] {
  return [
    ...detectDeprecationCandidates(report, statInWorkspace, windowLabel, neverDeprecate),
    ...detectConsolidationCandidates(report, windowLabel),
  ];
}

/**
 * Whether a PRODUCTION writer feeds the tool-fitness ledger (#5162).
 *
 * The ledger's only producer landed as #4723 and was reverted the same day by
 * #4731 (unbounded per-call rewrite cost at the 50k cap; no workspace
 * identifier, which made the #3902 per-workspace suppression unreachable). The
 * revert removed the code but NOT the ~470 records already written, and this
 * reader went on turning that residue into confident deprecation verdicts for
 * days — 24 of 30 live signals naming test fixtures the dead writer had
 * recorded while a test suite ran.
 *
 * With no producer, ANY ledger content is residue by definition, so the honest
 * output is "unmeasured", not a percentage. This repo's rule is explicit:
 * prefer a gate that reports `unmeasured` over one that reports a default as a
 * measurement.
 *
 * A staleness guard was considered and rejected: the residue is 5 days old and
 * the default lookback is 14 days, so a "newest record older than the window"
 * check does not fire on the very incident it was proposed for. Recency also
 * says nothing about COVERAGE — one day of records inside a 14-day window still
 * yields percentages presented as a 14-day measurement. That guard belongs in
 * #4656's acceptance criteria, on a producer that can actually go quiet.
 *
 * FLIP THIS in #4656, together with a test proving live data flows again.
 * Leaving it false under-reports (unmeasured despite data); flipping it early
 * misreports. Fail closed.
 */
export const TOOL_FITNESS_PRODUCER_WIRED = false;

/** The explicit no-producer envelope. Carries the tracking issue, not a number. */
function unmeasuredSignal(windowLabel: string): ImprovementSignal {
  return {
    category: 'tool-fitness',
    signalKey: 'tool-fitness:unmeasured:no-producer',
    severity: 'info',
    title: 'tool-fitness: unmeasured — no production writer feeds the ledger',
    body: [
      'No tool-fitness data was collected for this window.',
      '',
      "The ledger's only producer (#4723) was reverted by #4731 on 2026-08-24, so",
      'nothing records tool invocations today. Any records still on disk are that',
      "writer's residue and are NOT evidence of current tool health — reporting a",
      'success rate from them would state a default as a measurement.',
      '',
      `- Window: ${windowLabel}`,
      '- Producer: NONE (tracked in #4656)',
      '',
      'This family stays dark until #4656 lands a writer with workspace',
      'attribution and a bounded append cost.',
    ].join('\n'),
    evidence: { samples: 0, window: windowLabel },
  };
}

/**
 * Read the live tool-fitness ledger and produce suggest-tier signals. Fail-soft:
 * any ledger error yields NO signals (the review must never break on a
 * telemetry read). The ledger is injectable for tests.
 */
export function loadToolFitnessSignals(
  windowLabel: string,
  ledger: Pick<ToolFitnessLedger, 'report' | 'statForInWorkspace'> = getToolFitnessLedger(),
  /**
   * Injected so both arms stay reachable. Hardcoding the constant would leave
   * the registered-name screen below unexecutable behind a `false` — a guard
   * that cannot fire is the defect this change exists to remove.
   */
  producerWired: boolean = TOOL_FITNESS_PRODUCER_WIRED
): readonly ImprovementSignal[] {
  if (!producerWired) return [unmeasuredSignal(windowLabel)];
  try {
    // #5162: filter at the I/O boundary, not inside the detectors. The ledger is
    // an append-only log of whatever a producer wrote, so a name in it is not
    // evidence a tool exists — the reverted producer (#4723/#4731) wrote the
    // test suite's fixture tools (`throw_tool`, `null_args_tool`) into the real
    // ledger during its brief life, and this reader reported them as
    // deprecation candidates for days afterwards. A verdict about a tool the
    // server does not register is not a measurement, and must never reach the
    // remediation or issue-filing chain.
    //
    // The detectors stay pure functions over stats so they remain testable with
    // synthetic names; only real ledger data is screened.
    const report = ledger.report().filter((stat) => isRegisteredToolName(stat.tool));
    return detectToolFitnessSignals(
      report,
      (tool, ws) => ledger.statForInWorkspace(tool, ws),
      windowLabel
    );
  } catch {
    return [];
  }
}
