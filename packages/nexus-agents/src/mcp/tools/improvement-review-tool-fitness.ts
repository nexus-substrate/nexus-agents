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
  getToolFitnessLedger,
  ToolFitnessLedger,
  UNATTRIBUTED_WORKSPACE,
  type ToolFitnessStat,
} from '../../governance/tool-fitness-ledger.js';

// ============================================================================
// Honest thresholds (documented per acceptance criteria)
// ============================================================================

/**
 * Minimum invocations before the success-rate dimension is trustworthy. Below
 * this, a tool is judged on USAGE only (a 1/2-failure tool is noise, not a
 * fitness signal). Mirrors the improvement_review `minSampleSize` philosophy.
 */
export const FITNESS_MIN_SAMPLE = 10;

/**
 * At/under this invocation count a tool is a LOW-USAGE deprecation candidate —
 * it is barely being selected, so it may be dead weight against the ~47-tool
 * selection ceiling (epic #3850 narrative). Usage is global by nature, so this
 * is NOT workspace-scoped.
 */
export const LOW_USAGE_MAX_INVOCATIONS = 2;

/**
 * Success rate at/under this (with >= {@link FITNESS_MIN_SAMPLE} samples) makes a
 * tool a POOR-RELIABILITY deprecation candidate — it is selected but frequently
 * fails. Workspace-scoped (see {@link isHealthyInAnyOtherWorkspace}).
 */
export const POOR_SUCCESS_RATE_MAX = 0.5;

/**
 * A tool counts as "healthy in another workspace" when, scoped to that
 * workspace, its success rate clears this floor over a meaningful sample. Used
 * to suppress a global poor-reliability flag that is really workspace-local.
 */
export const HEALTHY_WORKSPACE_SUCCESS_FLOOR = 0.8;

/**
 * Consolidation: within a shared tool-name prefix family (e.g. `research_*`), a
 * member used at/under this FRACTION of the busiest sibling's invocations is a
 * consolidation candidate (could fold into a sibling). Family must have >= 2
 * members and the busiest sibling must clear {@link FITNESS_MIN_SAMPLE} so the
 * comparison isn't noise.
 */
export const CONSOLIDATION_USAGE_FRACTION = 0.1;

// ============================================================================
// SUGGEST-TIER invariant guard (Epic F)
// ============================================================================

/**
 * Runtime assertion of the Epic-F invariant: a tool-fitness signal is ALWAYS a
 * suggest-tier candidate, never an autonomous removal. Caps severity at
 * `warning` (never `critical`) so the priority classifier can't escalate a
 * fitness signal toward an auto-remediation tier, and pins the category. Throws
 * (loudly, in tests + dev) if a future edit tries to emit a removal-grade
 * signal. Returns the signal unchanged on success for fluent use.
 */
export function assertNeverAutonomousRemoval(signal: ImprovementSignal): ImprovementSignal {
  if (signal.category !== 'tool-fitness') {
    throw new Error(
      `tool-fitness invariant: expected category 'tool-fitness', got '${signal.category}'`
    );
  }
  if (signal.severity === 'critical') {
    throw new Error(
      `tool-fitness invariant (Epic F): a tool-fitness signal must be suggest-tier ` +
        `(severity 'info'|'warning'), never 'critical' — removal is NEVER autonomous`
    );
  }
  return signal;
}

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

/** Build a low-usage deprecation candidate signal (suggest-tier). */
function lowUsageSignal(stat: ToolFitnessStat, windowLabel: string): ImprovementSignal {
  return assertNeverAutonomousRemoval({
    category: 'tool-fitness',
    signalKey: `tool-fitness:deprecation-candidate:low-usage:${stat.tool}`,
    severity: 'info',
    title: `tool-fitness: \`${stat.tool}\` is a low-usage deprecation CANDIDATE (${String(stat.invocationCount)} invocations)`,
    body: [
      `\`${stat.tool}\` is barely selected and is a CANDIDATE for human review — NOT an automatic removal.`,
      '',
      `- Invocations: ${String(stat.invocationCount)} (threshold: ≤ ${String(LOW_USAGE_MAX_INVOCATIONS)})`,
      `- Last used: ${stat.lastUsedAt}`,
      `- Success rate: ${String(Math.round(stat.successRate * 100))}%`,
      `- Window: ${windowLabel}`,
      '',
      'SUGGEST-TIER ONLY (Epic F): low usage against the ~47-tool selection ceiling ' +
        'may mean dead weight. Removal is NEVER autonomous — it requires the Epic D ' +
        'human-ratification path (see the #3853 removal/consolidation runbook). ' +
        'Mind the LinUCB exploration floor: a low-usage tool must not death-spiral.',
    ].join('\n'),
    evidence: {
      samples: stat.invocationCount,
      window: windowLabel,
      observedValue: stat.invocationCount,
      threshold: LOW_USAGE_MAX_INVOCATIONS,
    },
  });
}

/** Build a poor-reliability deprecation candidate signal (suggest-tier). */
function poorReliabilitySignal(stat: ToolFitnessStat, windowLabel: string): ImprovementSignal {
  return assertNeverAutonomousRemoval({
    category: 'tool-fitness',
    signalKey: `tool-fitness:deprecation-candidate:poor-success:${stat.tool}`,
    severity: 'warning',
    title: `tool-fitness: \`${stat.tool}\` has a low success rate ${String(Math.round(stat.successRate * 100))}% — deprecation CANDIDATE`,
    body: [
      `\`${stat.tool}\` fails often across its uses and is a CANDIDATE for human review — NOT an automatic removal.`,
      '',
      `- Success rate: ${String(Math.round(stat.successRate * 100))}% (${String(stat.successCount)}/${String(stat.invocationCount)}, threshold ≤ ${String(Math.round(POOR_SUCCESS_RATE_MAX * 100))}%)`,
      `- Samples: ${String(stat.invocationCount)} (≥ ${String(FITNESS_MIN_SAMPLE)} required)`,
      `- Workspaces observed: ${stat.workspaces.join(', ')}`,
      `- Window: ${windowLabel}`,
      '',
      'Workspace-scoped (#3852): this fires only because the tool is unhealthy across ' +
        'workspaces, not just one — a single-workspace failure (local perms / missing ' +
        'deps) is suppressed so it cannot globally mis-flag a healthy tool.',
      '',
      'SUGGEST-TIER ONLY (Epic F): consider consolidating or deprecating after human ' +
        'review. Removal is NEVER autonomous — Epic D ratification (#3853 runbook).',
    ].join('\n'),
    evidence: {
      samples: stat.invocationCount,
      window: windowLabel,
      observedValue: stat.successRate,
      threshold: POOR_SUCCESS_RATE_MAX,
    },
  });
}

/** Build a consolidation candidate signal (suggest-tier). */
function consolidationSignal(
  stat: ToolFitnessStat,
  family: string,
  busiestTool: string,
  busiestCount: number,
  windowLabel: string
): ImprovementSignal {
  return assertNeverAutonomousRemoval({
    category: 'tool-fitness',
    signalKey: `tool-fitness:consolidation-candidate:${stat.tool}`,
    severity: 'info',
    title: `tool-fitness: \`${stat.tool}\` is a consolidation CANDIDATE within the \`${family}_*\` family`,
    body: [
      `\`${stat.tool}\` is far less used than its \`${family}_*\` siblings and is a CANDIDATE ` +
        `for folding into a sibling — for human review, NOT an automatic removal.`,
      '',
      `- This tool: ${String(stat.invocationCount)} invocations`,
      `- Busiest sibling \`${busiestTool}\`: ${String(busiestCount)} invocations`,
      `- Ratio: ${String(Math.round((stat.invocationCount / busiestCount) * 100))}% (threshold ≤ ${String(Math.round(CONSOLIDATION_USAGE_FRACTION * 100))}%)`,
      `- Window: ${windowLabel}`,
      '',
      'SUGGEST-TIER ONLY (Epic F): overlapping tools inflate the selection surface. ' +
        'Consolidation is a human decision via the Epic D path (#3853 runbook); nothing ' +
        'here removes or merges anything automatically.',
    ].join('\n'),
    evidence: {
      samples: stat.invocationCount,
      window: windowLabel,
      observedValue: stat.invocationCount / busiestCount,
      threshold: CONSOLIDATION_USAGE_FRACTION,
    },
  });
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

/** Consolidation candidates within ONE family (busiest already cleared the floor). */
function familyConsolidationSignals(
  members: readonly ToolFitnessStat[],
  family: string,
  busiest: ToolFitnessStat,
  windowLabel: string
): readonly ImprovementSignal[] {
  const cutoff = busiest.invocationCount * CONSOLIDATION_USAGE_FRACTION;
  return members
    .filter((m) => m.tool !== busiest.tool && m.invocationCount <= cutoff)
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

/**
 * Detect deprecation candidates (low usage OR poor reliability) from a fitness
 * report, scoping the reliability dimension by workspace to defeat
 * context-poisoning. Pure: the `statInWorkspace` resolver is injected.
 */
export function detectDeprecationCandidates(
  report: readonly ToolFitnessStat[],
  statInWorkspace: (tool: string, workspace: string) => ToolFitnessStat | undefined,
  windowLabel: string
): readonly ImprovementSignal[] {
  const signals: ImprovementSignal[] = [];
  for (const stat of report) {
    if (stat.invocationCount <= LOW_USAGE_MAX_INVOCATIONS) {
      signals.push(lowUsageSignal(stat, windowLabel));
      continue; // low-usage already covers it; don't double-flag.
    }
    if (
      stat.invocationCount >= FITNESS_MIN_SAMPLE &&
      stat.successRate <= POOR_SUCCESS_RATE_MAX &&
      !isHealthyInAnyOtherWorkspace(stat, statInWorkspace)
    ) {
      signals.push(poorReliabilitySignal(stat, windowLabel));
    }
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
  windowLabel: string
): readonly ImprovementSignal[] {
  return [
    ...detectDeprecationCandidates(report, statInWorkspace, windowLabel),
    ...detectConsolidationCandidates(report, windowLabel),
  ];
}

/**
 * Read the live tool-fitness ledger and produce suggest-tier signals. Fail-soft:
 * any ledger error yields NO signals (the review must never break on a
 * telemetry read). The ledger is injectable for tests.
 */
export function loadToolFitnessSignals(
  windowLabel: string,
  ledger: Pick<ToolFitnessLedger, 'report' | 'statForInWorkspace'> = getToolFitnessLedger()
): readonly ImprovementSignal[] {
  try {
    const report = ledger.report();
    return detectToolFitnessSignals(
      report,
      (tool, ws) => ledger.statForInWorkspace(tool, ws),
      windowLabel
    );
  } catch {
    return [];
  }
}
