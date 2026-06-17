/**
 * Refined heuristics for the tool-fitness consumer (#3902, refining #3852).
 *
 * Sibling helper module extracted to keep the consumer under the 400-line cap.
 * Owns three signal-quality refinements raised in the #3900 ratification
 * (Contrarian's signal-quality concerns):
 *
 * 1. **Consolidation overlap, not bare prefix** — a shared name-prefix is NOT
 *    proof of substitutability (`git_commit` vs `git_init`, `db_read` vs
 *    `db_drop_table` share a prefix but are orthogonal). {@link consolidationConfidence}
 *    downgrades prefix-only matches to a WEAK/low-confidence hint and withholds
 *    the candidate entirely when the action-verb suffixes are clearly orthogonal,
 *    so a rare sibling is not flagged for folding into a busy one on prefix alone.
 *    (Full capability-overlap modelling is a later seam — see TODO below.)
 * 2. **Break-glass exemption** — {@link isNeverDeprecate} exempts low-usage-BY-DESIGN
 *    tools (rollback / recovery / emergency admin) from the `<= 2 invocations`
 *    deprecation flag so a rare-but-critical tool isn't surfaced as dead weight.
 * 3. **Workspace-scoped localized signal** — instead of FULLY suppressing a
 *    cross-workspace-healthy tool's failure, {@link buildLocalizedSignals} emits a
 *    workspace-scoped "failing here" signal (global deprecation suppressed; the
 *    genuine localized misconfig warning still surfaces).
 *
 * EPIC F INVARIANT preserved: every builder here returns a suggest-tier signal
 * (severity `info`/`warning`, never `critical`) routed through the consumer's
 * `assertNeverAutonomousRemoval` guard. Nothing here removes anything.
 *
 * @module mcp/tools/improvement-review-tool-fitness-heuristics
 * (Source: Issue #3902)
 */

import type { ImprovementSignal } from './improvement-review.js';
import type { ToolFitnessStat } from '../../governance/tool-fitness-ledger.js';

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
 * fails. Workspace-scoped.
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
// Item 2 — break-glass / never-deprecate exemption
// ============================================================================

/**
 * Default action-verb fragments that mark a tool as low-usage-BY-DESIGN
 * (break-glass / recovery / emergency admin). A tool whose name contains one of
 * these is rare ON PURPOSE — flagging it for deprecation on a `<= 2 invocations`
 * count is a false positive. Matched case-insensitively as a substring of the
 * tool name. Override via {@link NeverDeprecateConfig.extraPatterns} /
 * {@link NeverDeprecateConfig.exemptTools} for repo-specific break-glass tools.
 */
export const DEFAULT_NEVER_DEPRECATE_PATTERNS: readonly string[] = [
  'rollback',
  'recover',
  'restore',
  'emergency',
  'break_glass',
  'breakglass',
  'panic',
  'failover',
  'disaster',
  'evacuate',
  'quarantine',
];

/** Injectable break-glass exemption config (defaults preserve current behavior + the safe-list). */
export interface NeverDeprecateConfig {
  /** Exact tool names that are never deprecation candidates regardless of usage. */
  readonly exemptTools?: readonly string[];
  /** Extra substring patterns appended to {@link DEFAULT_NEVER_DEPRECATE_PATTERNS}. */
  readonly extraPatterns?: readonly string[];
}

/**
 * True when `tool` is tagged never-deprecate / break-glass and must therefore be
 * EXEMPT from the low-usage deprecation flag (item 2). Pure.
 */
export function isNeverDeprecate(tool: string, config?: NeverDeprecateConfig): boolean {
  if (config?.exemptTools?.includes(tool) === true) return true;
  const lower = tool.toLowerCase();
  const patterns = [...DEFAULT_NEVER_DEPRECATE_PATTERNS, ...(config?.extraPatterns ?? [])];
  return patterns.some((p) => lower.includes(p));
}

// ============================================================================
// Item 1 — consolidation overlap confidence (prefix is only a WEAK hint)
// ============================================================================

/**
 * Action verbs that mutate/destroy vs. read/create — when two prefix-siblings
 * carry verbs from clearly opposed groups they are ORTHOGONAL (not
 * substitutable), so the prefix match is suppressed entirely. This is the
 * honest, ledger-name-only overlap proxy; a real capability/schema-overlap model
 * is the later seam.
 *
 * TODO(#3902): replace this name-suffix heuristic with a true capability-overlap
 * signal (tool input/output schema similarity) once the tool-distinctness data
 * seam lands. Until then prefix-family is a WEAK hint only.
 */
const ORTHOGONAL_VERB_GROUPS: readonly (readonly string[])[] = [
  ['init', 'create', 'add', 'new', 'open', 'start', 'enable', 'register'],
  ['drop', 'delete', 'remove', 'destroy', 'close', 'stop', 'disable', 'purge'],
  ['read', 'get', 'list', 'query', 'show', 'status', 'inspect'],
  ['commit', 'write', 'update', 'set', 'put', 'apply'],
];

/** Confidence of a prefix-only consolidation hint. */
export type ConsolidationConfidence = 'low' | 'none';

/** The action-verb suffix of a tool name (segment after the family prefix). */
function actionVerb(tool: string): string | undefined {
  const sep = /[_-]/;
  const parts = tool.toLowerCase().split(sep).filter(Boolean);
  return parts.length >= 2 ? parts[1] : undefined;
}

/** Index of the orthogonal-verb group a verb belongs to, or -1. */
function verbGroup(verb: string | undefined): number {
  if (verb === undefined) return -1;
  return ORTHOGONAL_VERB_GROUPS.findIndex((g) => g.includes(verb));
}

/**
 * Confidence that a prefix-sharing pair (`candidate`, `busiest`) is genuinely a
 * consolidation candidate, using a name-suffix overlap proxy (item 1):
 *
 * - `'none'` — the two verbs sit in clearly OPPOSED action groups
 *   (e.g. `init` vs `drop`, `commit` vs `init`) → orthogonal, do NOT surface.
 * - `'low'` — prefix matches but overlap is unproven → surface as a
 *   LOW-CONFIDENCE hint (the prefix family alone is weak evidence).
 *
 * Pure. There is no `'high'` tier yet: until a real capability-overlap model
 * exists, prefix-family is never strong evidence. (See module TODO.)
 */
export function consolidationConfidence(
  candidate: ToolFitnessStat,
  busiest: ToolFitnessStat
): ConsolidationConfidence {
  const a = verbGroup(actionVerb(candidate.tool));
  const b = verbGroup(actionVerb(busiest.tool));
  // Both verbs classified and in different opposed groups → orthogonal siblings.
  if (a !== -1 && b !== -1 && a !== b) return 'none';
  return 'low';
}

// ============================================================================
// Suggest-tier signal builders (all routed through the Epic-F guard)
// ============================================================================

/** Build a low-usage deprecation candidate signal (suggest-tier). */
export function lowUsageSignal(stat: ToolFitnessStat, windowLabel: string): ImprovementSignal {
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
export function poorReliabilitySignal(
  stat: ToolFitnessStat,
  windowLabel: string
): ImprovementSignal {
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

/**
 * Build a WORKSPACE-SCOPED localized reliability signal (#3902 item 3). Emitted
 * when a tool's poor GLOBAL rate was suppressed as context-poisoning (healthy
 * elsewhere) BUT it is genuinely failing in `workspace` — the global deprecation
 * stays suppressed, yet the localized "failing here" misconfig warning still
 * surfaces instead of being fully silenced. Suggest-tier; explicitly NOT a
 * deprecation candidate.
 */
export function localizedReliabilitySignal(
  scoped: ToolFitnessStat,
  workspace: string,
  windowLabel: string
): ImprovementSignal {
  return assertNeverAutonomousRemoval({
    category: 'tool-fitness',
    signalKey: `tool-fitness:localized-failure:${scoped.tool}:${workspace}`,
    severity: 'warning',
    title: `tool-fitness: \`${scoped.tool}\` is failing in workspace \`${workspace}\` (healthy elsewhere)`,
    body: [
      `\`${scoped.tool}\` is healthy in other workspaces, so this is NOT a global deprecation ` +
        `candidate. But it fails locally in \`${workspace}\` — a likely LOCALIZED misconfig ` +
        `(local perms / missing deps / repo-specific config) worth investigating HERE.`,
      '',
      `- Workspace: ${workspace}`,
      `- Local success rate: ${String(Math.round(scoped.successRate * 100))}% (${String(scoped.successCount)}/${String(scoped.invocationCount)}, threshold ≤ ${String(Math.round(POOR_SUCCESS_RATE_MAX * 100))}%)`,
      `- Local samples: ${String(scoped.invocationCount)} (≥ ${String(FITNESS_MIN_SAMPLE)} required)`,
      `- Window: ${windowLabel}`,
      '',
      'WORKSPACE-SCOPED (#3902): cross-workspace suppression fixes context-poisoning but ' +
        'should not discard a genuine localized warning. This surfaces the local failure ' +
        'WITHOUT globally mis-flagging a tool that is healthy elsewhere.',
      '',
      'SUGGEST-TIER ONLY (Epic F): a localized diagnostic for human review — never an ' +
        'autonomous removal. Removal is Epic D ratification (#3853 runbook).',
    ].join('\n'),
    evidence: {
      samples: scoped.invocationCount,
      window: windowLabel,
      observedValue: scoped.successRate,
      threshold: POOR_SUCCESS_RATE_MAX,
    },
  });
}

/** Build a consolidation candidate signal (suggest-tier, LOW-CONFIDENCE per #3902). */
export function consolidationSignal(
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
    title: `tool-fitness: \`${stat.tool}\` is a LOW-CONFIDENCE consolidation CANDIDATE within the \`${family}_*\` family`,
    body: [
      `\`${stat.tool}\` is far less used than its \`${family}_*\` siblings and is a CANDIDATE ` +
        `for folding into a sibling — for human review, NOT an automatic removal.`,
      '',
      `- This tool: ${String(stat.invocationCount)} invocations`,
      `- Busiest sibling \`${busiestTool}\`: ${String(busiestCount)} invocations`,
      `- Ratio: ${String(Math.round((stat.invocationCount / busiestCount) * 100))}% (threshold ≤ ${String(Math.round(CONSOLIDATION_USAGE_FRACTION * 100))}%)`,
      `- Window: ${windowLabel}`,
      `- Confidence: LOW (#3902) — a shared name-prefix is a WEAK hint, NOT proof of`,
      '  substitutability. The orthogonal-action-verb check passed (siblings are not',
      '  obviously opposed like `init` vs `drop`), but no capability/schema-overlap',
      '  signal exists yet to confirm these tools are actually interchangeable.',
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
