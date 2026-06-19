/**
 * nexus-agents/mcp - Improvement Review Tool
 *
 * Periodic, threshold-gated observability-driven improvement loop.
 *
 * Reads from existing observability primitives (OutcomeStore, weather-report,
 * fitness-audit, audit-chain) and surfaces patterns that cross documented
 * thresholds as candidate GitHub issues. Never auto-merges; humans or
 * `consensus_vote` decide what to implement.
 *
 * Replaces the deleted `src/workflows/self-development/` engine, which never
 * wired up to consume any of these signals.
 *
 * @module mcp/tools/improvement-review
 * (Source: Issue #2402)
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
/* eslint-disable max-lines */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError, getErrorMessage, type ILogger } from '../../core/index.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { withPrerequisite } from '../middleware/tool-prerequisites.js';
import {
  toolStructuredError,
  toolSuccessStructured,
  type ToolResult,
  type BaseMcpToolDeps,
} from './tool-result.js';
import { getOutcomeStore } from '../../orchestration/outcomes/outcome-store.js';
import type { TaskOutcome } from '../../orchestration/outcomes/outcome-types.js';
import { calculateFitnessScore, type FitnessAudit } from '../../governance/fitness-score.js';
import { getPipelineEventBus } from '../../pipeline/event-bus.js';
import type { VoteRejectedSignalEvent } from '../../pipeline/event-types.js';
import { REJECTION_CATEGORIES } from '../../consensus/types-core.js';
import { emitFitnessDeclinedSignal } from './improvement-review-signals.js';
import { loadToolFitnessSignals } from './improvement-review-tool-fitness.js';
import {
  detectPerfRegressionSignals,
  type PerfBaselineMap,
} from './improvement-review-perf-regression.js';
import type { BenchmarkSuiteResult } from '../../benchmarks/benchmark-types.js';
import { improvementSignalsToTasks } from './improvement-remediation.js';
import { recordRemediationShadow } from './improvement-remediation-shadow.js';
import { classifySignalPriority, priorityLabel } from './remediation-priority.js';
import type { PipelineTask } from '../../pipeline/dev-pipeline.js';
import { getToolAnnotations } from '../tool-annotations.js';

const execFileAsync = promisify(execFile);

// ============================================================================
// Schemas
// ============================================================================

export const ImprovementReviewInputSchema = z.object({
  lookbackDays: z
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .default(7)
    .describe('Lookback window for outcome data, in days. Default 7.'),
  fileIssues: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'When true, file candidate issues via `gh issue create` for crossed thresholds (rate-limited to 5 per run, deduped against open issues). When false (default), return signals only.'
    ),
  minSampleSize: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(5)
    .describe('Minimum sample size before a CLI/category signal can fire.'),
  fitnessFloor: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .default(90)
    .describe('Fitness score below this threshold triggers a tech-debt signal.'),
  selfEvalReportPath: z
    .string()
    .optional()
    .describe(
      'Optional path to a self-eval JSON report (from `self-eval --json`). When set, ' +
        'high-confidence unanimous deprecate/refactor findings are surfaced as tech-debt ' +
        'signals through the same deduped/rate-limited issue path (#3224). Unreadable/malformed ' +
        'reports are skipped (no signal). Absent → no self-eval signals.'
    ),
});

export type ImprovementReviewInput = z.infer<typeof ImprovementReviewInputSchema>;

export type SignalCategory =
  | 'routing'
  | 'tech-debt'
  | 'bug'
  | 'security'
  | 'consensus'
  // #3852 (closes the #3692 sequencing): tool-fitness deprecation/consolidation
  // candidates from the #3851 ledger. SUGGEST-TIER ONLY — never autonomous
  // removal (Epic F invariant). See improvement-review-tool-fitness.ts.
  | 'tool-fitness'
  // #3692 + #3246 (Option A): deterministic benchmark perf regression vs a
  // STATIC, pinned baseline + fixed tolerance. SURFACED-ONLY — never auto-applies
  // a fitness/governance penalty. The static baseline keeps this out of the
  // deferred #3230 adaptive-control scope. See improvement-review-perf-regression.ts.
  | 'perf-regression';

export interface ImprovementSignal {
  readonly category: SignalCategory;
  /** Stable key used for dedup against existing issues. */
  readonly signalKey: string;
  /** Severity per CVSS-aligned scale (security uses critical; others use warning/info). */
  readonly severity: 'info' | 'warning' | 'critical';
  /** One-line title suitable for a GitHub issue. */
  readonly title: string;
  /** Multi-line body with evidence (sample counts, time windows, observed values). */
  readonly body: string;
  /** Linkable evidence the signal is grounded in observability data, not intuition. */
  readonly evidence: {
    readonly samples?: number;
    readonly window?: string;
    readonly observedValue?: number;
    readonly threshold?: number;
  };
}

export interface ImprovementReviewResponse {
  readonly window: string;
  readonly totalOutcomes: number;
  readonly signals: readonly ImprovementSignal[];
  /**
   * Remediation tasks derived from {@link signals} (#3540 capability-loop
   * increment 1) — SUGGEST-ONLY: structured tasks for a reviewer to consider
   * routing through the dev-pipeline. Nothing here is executed or auto-invoked.
   */
  readonly remediationTasks: readonly PipelineTask[];
  readonly issuesFiled: readonly { readonly signalKey: string; readonly issueUrl: string }[];
  readonly issuesSkipped: readonly { readonly signalKey: string; readonly reason: string }[];
}

// ============================================================================
// Pure threshold logic (testable without fs / network)
// ============================================================================

const MAX_ISSUES_PER_RUN = 5;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Filter outcomes to a lookback window. Outcome timestamps are ISO strings. */
export function filterByLookback(
  outcomes: readonly TaskOutcome[],
  lookbackDays: number,
  now: number
): readonly TaskOutcome[] {
  const cutoff = now - lookbackDays * DAY_MS;
  return outcomes.filter((o) => {
    const t = Date.parse(o.timestamp);
    return Number.isFinite(t) && t >= cutoff;
  });
}

/**
 * Infrastructure/transport failure categories — NOT model reasoning quality
 * (#3620). These are excluded from the CLI performance-floor so the routing
 * signal measures whether the MODEL does the task, not whether the adapter was
 * reachable. Adapter outages / empty responses still surface separately via
 * {@link detectFailureCategoryConcentration}, so excluding them here doesn't hide
 * them — it just stops them being mislabeled as a CLI quality regression.
 */
const INFRA_FAILURE_CATEGORIES: ReadonlySet<string> = new Set([
  'timeout',
  'authentication',
  'rate_limit',
  'connection',
  'adapter_unavailable',
  'parse',
]);

/**
 * Detect CLI × category pairs whose MODEL-QUALITY success rate has fallen below
 * the performance floor with at least minSamples observations.
 *
 * Threshold: quality success rate < 60% AND quality-samples >= minSamples.
 * Infra/transport failures (adapter_unavailable, parse/empty-response, auth,
 * rate-limit, timeout, connection) are excluded from the rate (#3620) — they are
 * availability problems, not model quality, and surface via the failure-category
 * concentration detector instead.
 */
interface QualityBucket {
  cli: string;
  category: string;
  ok: number;
  total: number;
  infra: number;
}

/**
 * Models/clis that don't identify a real executor (#3624) — outcomes with these
 * can't be attributed to a CLI's quality, so they're excluded from the floor
 * (else the skew just moves from a real CLI onto an `unknown`/placeholder one).
 */
const UNATTRIBUTED_VALUES: ReadonlySet<string> = new Set([
  '',
  'unknown',
  'expert',
  'heuristic',
  'default',
]);

/** Bucket outcomes by cli×category, separating infra failures from quality ones. */
function accumulateQualityBuckets(outcomes: readonly TaskOutcome[]): Map<string, QualityBucket> {
  const buckets = new Map<string, QualityBucket>();
  for (const o of outcomes) {
    // Skip outcomes that can't attribute a real executing CLI (#3624).
    if (UNATTRIBUTED_VALUES.has(o.cli) || UNATTRIBUTED_VALUES.has(o.model)) continue;
    const key = `${o.cli}::${o.category}`;
    const b = buckets.get(key) ?? { cli: o.cli, category: o.category, ok: 0, total: 0, infra: 0 };
    if (!o.success && INFRA_FAILURE_CATEGORIES.has(o.failureCategory ?? '')) {
      b.infra += 1; // infra/transport failure — excluded from the quality rate
    } else {
      b.total += 1;
      if (o.success) b.ok += 1;
    }
    buckets.set(key, b);
  }
  return buckets;
}

/** Build a performance-floor signal for a below-floor quality bucket. */
function floorSignalFromBucket(
  b: QualityBucket,
  minSamples: number,
  windowLabel: string
): ImprovementSignal {
  const rate = b.ok / b.total;
  const ratePct = Math.round(rate * 100);
  const infraNote =
    b.infra > 0
      ? ` (${String(b.infra)} infra/transport failures excluded — see failure-concentration signals)`
      : '';
  return {
    category: 'routing',
    signalKey: `routing:cli-floor:${b.cli}:${b.category}`,
    severity: rate < 0.4 ? 'critical' : 'warning',
    title: `routing: ${b.cli} model-quality success ${String(ratePct)}% on ${b.category} (${windowLabel})`,
    body: [
      `Observed model-quality performance floor breach in the ${windowLabel} window.`,
      '',
      `- CLI: \`${b.cli}\``,
      `- Category: \`${b.category}\``,
      `- Quality success rate: ${String(ratePct)}% (${String(b.ok)}/${String(b.total)})${infraNote}`,
      `- Threshold: 60% with ≥${String(minSamples)} quality samples`,
      '',
      'Quality failures only (infra/transport excluded). Consider routing this category away from this CLI, or investigating the failure pattern via `weather_report` and the OutcomeStore.',
    ].join('\n'),
    evidence: { samples: b.total, window: windowLabel, observedValue: rate, threshold: 0.6 },
  };
}

export function detectCliPerformanceFloor(
  outcomes: readonly TaskOutcome[],
  minSamples: number,
  windowLabel: string
): readonly ImprovementSignal[] {
  const signals: ImprovementSignal[] = [];
  for (const b of accumulateQualityBuckets(outcomes).values()) {
    if (b.total < minSamples) continue;
    if (b.ok / b.total >= 0.6) continue;
    signals.push(floorSignalFromBucket(b, minSamples, windowLabel));
  }
  return signals;
}

/**
 * Minimum number of rejected plans citing the same ADR-0016 rule before a
 * recurring-rejection pattern is worth surfacing. Two is coincidence; three is
 * a systemic planning gap (mirrors the DRY "third occurrence" rule).
 */
const MIN_REJECTION_PATTERN = 3;

/**
 * Detect recurring consensus-rejection patterns (#3259): a single ADR-0016
 * rejection rule (`DRY_VIOLATION`, `OVER_ENGINEERING`, `SCOPE_CREEP`, …) cited
 * across ≥{@link MIN_REJECTION_PATTERN} rejected plans in the window. The
 * `signal.vote_rejected` events are produced by `consensus_vote` on rejection
 * (consensus-vote-signals.ts) and buffered on the pipeline event bus; this
 * detector closes the loop the system review flagged as missing — recurring
 * rejection for the same reason means the planner keeps making the same class
 * of mistake, which the next improvement cycle should name explicitly.
 *
 * Events with no `rejectionRules` (un-categorized rejections) contribute no
 * pattern signal — there is nothing actionable to aggregate on.
 */
export function detectConsensusRejectionSignals(
  events: readonly VoteRejectedSignalEvent[],
  windowLabel: string
): readonly ImprovementSignal[] {
  if (events.length === 0) return [];

  // Defense-in-depth allowlist: the only producer (consensus-vote-signals.ts)
  // sources rules from the Zod-validated ADR-0016 enum, so a free-form/poisoned
  // rule cannot reach here today. Re-validating against REJECTION_CATEGORIES
  // makes that safety local — an unexpected rule string never reaches an issue
  // title/body — instead of relying on cross-file inference (#3259 review).
  const allowed = new Set<string>(REJECTION_CATEGORIES);
  const byRule = new Map<string, number>();
  for (const e of events) {
    for (const rule of e.rejectionRules ?? []) {
      if (!allowed.has(rule)) continue;
      byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
    }
  }

  const signals: ImprovementSignal[] = [];
  for (const [rule, count] of byRule) {
    if (count < MIN_REJECTION_PATTERN) continue;
    signals.push({
      category: 'consensus',
      signalKey: `consensus:rejection-pattern:${rule}`,
      severity: count >= MIN_REJECTION_PATTERN * 2 ? 'warning' : 'info',
      title: `consensus: ${String(count)} plans rejected for \`${rule}\` in ${windowLabel}`,
      body: [
        `Recurring consensus-rejection pattern in the ${windowLabel} window.`,
        '',
        `- Rejection rule: \`${rule}\` (ADR-0016 category)`,
        `- Occurrences: ${String(count)} rejected plans`,
        `- Threshold: ≥${String(MIN_REJECTION_PATTERN)} plans citing the same rule`,
        '',
        'The planner keeps producing plans that voters reject for the same reason. ' +
          'Feed this back into plan generation (e.g. a planning guardrail or a ' +
          'targeted prompt note) rather than rejecting plan-by-plan. Inspect the ' +
          'rejected proposals via `query_trace` / the consensus audit chain.',
      ].join('\n'),
      evidence: {
        samples: count,
        window: windowLabel,
        observedValue: count,
        threshold: MIN_REJECTION_PATTERN,
      },
    });
  }
  return signals;
}

/**
 * Detect failure-category concentration: a single failure category accounts
 * for > 50% of all failures with at least 10 failures observed.
 */
export function detectFailureCategoryConcentration(
  outcomes: readonly TaskOutcome[],
  windowLabel: string
): readonly ImprovementSignal[] {
  const failures = outcomes.filter((o) => !o.success);
  if (failures.length < 10) return [];

  const byCategory = new Map<string, number>();
  for (const f of failures) {
    const cat = f.failureCategory ?? 'unknown';
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
  }

  const signals: ImprovementSignal[] = [];
  for (const [cat, count] of byCategory) {
    const share = count / failures.length;
    if (share <= 0.5) continue;
    const sharePct = Math.round(share * 100);
    signals.push({
      category: 'bug',
      signalKey: `bug:failure-concentration:${cat}`,
      severity: 'warning',
      title: `bug: ${String(sharePct)}% of failures in ${windowLabel} share category \`${cat}\``,
      body: [
        `Failure-category concentration breach in the ${windowLabel} window.`,
        '',
        `- Category: \`${cat}\``,
        `- Share: ${String(sharePct)}% (${String(count)}/${String(failures.length)} failures)`,
        `- Threshold: > 50% with ≥10 failures`,
        '',
        'A single failure mode dominating the error budget usually means a systemic bug or routing miss. Investigate via `query_trace` and the OutcomeStore.',
      ].join('\n'),
      evidence: {
        samples: failures.length,
        window: windowLabel,
        observedValue: share,
        threshold: 0.5,
      },
    });
  }
  return signals;
}

function buildFloorSignal(audit: FitnessAudit, fitnessFloor: number): ImprovementSignal {
  return {
    category: 'tech-debt',
    signalKey: `tech-debt:fitness-below-floor`,
    severity: audit.score < 70 ? 'critical' : 'warning',
    title: `tech-debt: fitness score ${String(audit.score)}/100 below floor ${String(fitnessFloor)}`,
    body: [
      `Code fitness score has dropped below the governance floor.`,
      '',
      `- Score: ${String(audit.score)} / 100`,
      `- Floor: ${String(fitnessFloor)} (governance threshold per CLAUDE.md)`,
      `- Findings: ${String(audit.findings.length)} total`,
      '',
      'Run `nexus-agents fitness-audit` for the full breakdown. Critical findings:',
      ...audit.findings
        .filter((f) => f.severity === 'critical')
        .slice(0, 5)
        .map((f) => `- ${f.dimension}: ${f.description}`),
    ].join('\n'),
    evidence: { observedValue: audit.score, threshold: fitnessFloor },
  };
}

function buildCriticalFindingSignal(finding: FitnessAudit['findings'][number]): ImprovementSignal {
  return {
    category: 'tech-debt',
    signalKey: `tech-debt:fitness-critical:${finding.dimension}`,
    severity: 'critical',
    title: `tech-debt: critical fitness finding in ${finding.dimension}`,
    body: [
      `Fitness audit returned a CRITICAL finding.`,
      '',
      `- Dimension: \`${finding.dimension}\``,
      `- Description: ${finding.description}`,
      `- Points deducted: ${String(finding.pointsDeducted)}`,
      finding.location !== undefined ? `- Location: ${finding.location}` : '',
      finding.suggestion !== undefined ? `- Suggestion: ${finding.suggestion}` : '',
    ]
      .filter((line) => line.length > 0)
      .join('\n'),
    evidence: { observedValue: -finding.pointsDeducted },
  };
}

/** Detect fitness signals: score below floor OR critical findings. */
export function detectFitnessSignals(
  audit: FitnessAudit,
  fitnessFloor: number
): readonly ImprovementSignal[] {
  const signals: ImprovementSignal[] = [];
  // #3621: a non-auditable result (e.g. run from the global npm install) has a
  // meaningless score of 0 — it is "could not audit", not "fitness is low". Do
  // not emit a spurious below-floor tech-debt signal for it.
  if (audit.auditable === false) return signals;
  if (audit.score < fitnessFloor) signals.push(buildFloorSignal(audit, fitnessFloor));
  for (const finding of audit.findings) {
    if (finding.severity === 'critical') signals.push(buildCriticalFindingSignal(finding));
  }
  return signals;
}

// ============================================================================
// Self-eval findings → tech-debt signals (#3224)
// ============================================================================

/** Minimum confidence for a self-eval finding to surface as a signal. */
const SELF_EVAL_CONFIDENCE_FLOOR = 0.8;

/**
 * Minimal, defensive schema for the `self-eval --json` report. We only read the
 * fields needed to surface a finding; unknown extras are ignored so the parse
 * tolerates schema drift in the (externally produced) artifact.
 */
const SelfEvalReportSchema = z.object({
  results: z.array(
    z.object({
      component: z.string(),
      finalRecommendation: z.string(),
      confidence: z.number(),
      dissent: z.array(z.unknown()).optional().default([]),
      evidenceQuality: z.number().optional(),
    })
  ),
});

/**
 * Convert a parsed self-eval report into tech-debt `ImprovementSignal`s.
 *
 * Only **actionable, high-confidence, unanimous** findings surface (#3224): a
 * `deprecate`/`refactor` recommendation with NO dissent and confidence at/above
 * {@link SELF_EVAL_CONFIDENCE_FLOOR}. This is a pure transform — it surfaces a
 * human decision point (a candidate issue), never an automatic routing change.
 */
export function detectSelfEvalSignals(
  report: z.infer<typeof SelfEvalReportSchema>,
  windowLabel: string
): readonly ImprovementSignal[] {
  const signals: ImprovementSignal[] = [];
  for (const r of report.results) {
    const actionable =
      r.finalRecommendation === 'deprecate' || r.finalRecommendation === 'refactor';
    if (!actionable || r.dissent.length > 0 || r.confidence < SELF_EVAL_CONFIDENCE_FLOOR) continue;
    signals.push({
      category: 'tech-debt',
      signalKey: `tech-debt:self-eval:${r.component}:${r.finalRecommendation}`,
      severity: r.finalRecommendation === 'deprecate' ? 'warning' : 'info',
      title: `tech-debt: self-eval recommends ${r.finalRecommendation} for ${r.component}`,
      body: [
        `All self-eval evaluators agreed (no dissent) on **${r.finalRecommendation}** for \`${r.component}\``,
        `with confidence ${(r.confidence * 100).toFixed(0)}%${r.evidenceQuality !== undefined ? ` (evidence quality ${(r.evidenceQuality * 100).toFixed(0)}%)` : ''}.`,
        '',
        'This is a RECOMMENDATION surfaced for human review — not an automatic change.',
      ].join('\n'),
      evidence: {
        observedValue: r.confidence,
        threshold: SELF_EVAL_CONFIDENCE_FLOOR,
        window: windowLabel,
      },
    });
  }
  return signals;
}

/**
 * Read + parse a self-eval JSON report and convert it to signals. Fail-soft:
 * an unreadable or malformed report yields NO signals (logged at warn) rather
 * than breaking the review.
 */
export async function loadSelfEvalSignals(
  reportPath: string,
  windowLabel: string,
  logger: ReturnType<typeof createLogger>
): Promise<readonly ImprovementSignal[]> {
  try {
    const raw = await readFile(reportPath, 'utf8');
    const parsed = SelfEvalReportSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      logger.warn('Self-eval report ignored — schema mismatch', {
        reportPath,
        error: formatZodError(parsed.error),
      });
      return [];
    }
    return detectSelfEvalSignals(parsed.data, windowLabel);
  } catch (error) {
    logger.warn('Self-eval report ignored — unreadable/invalid JSON', {
      reportPath,
      error: getErrorMessage(error),
    });
    return [];
  }
}

// ============================================================================
// Issue filing (gated, dedup-checked, command-injection-safe)
// ============================================================================

/**
 * Check whether an existing OPEN issue already covers this signal key.
 * Uses `gh issue list --search` with the signal key as a literal phrase.
 * The signal key appears in our filed-issue body so this dedup is reliable.
 */
async function existingIssueForSignal(signalKey: string): Promise<string | null> {
  try {
    // Strip double-quotes from the search term so a quote in the signalKey
    // (e.g. an oddly-named self-eval component path, #3224) can't break the
    // `"..." in:body` phrase query and silently defeat dedup → refiling.
    const searchTerm = signalKey.replace(/"/g, '');
    const { stdout } = await execFileAsync('gh', [
      'issue',
      'list',
      '--state',
      'open',
      '--search',
      `"${searchTerm}" in:body`,
      '--json',
      'number,url',
      '--limit',
      '5',
    ]);
    const parsed = JSON.parse(stdout) as readonly { url?: string }[];
    if (parsed.length > 0 && typeof parsed[0]?.url === 'string') {
      return parsed[0].url;
    }
    return null;
  } catch {
    // gh failure → conservatively treat as "no dup" but log upstream.
    return null;
  }
}

/**
 * Labels for an auto-filed signal issue (#3653): the p0–p4 priority (computed by
 * {@link classifySignalPriority} from TYPED signal fields — security is always p0,
 * fail-closed; never taken from untrusted input, so an issue cannot steer its own
 * tag) plus the signal category. The priority drives the consensus rigor the
 * auto-remediation path later requires for this issue.
 */
export function issueLabelsForSignal(signal: ImprovementSignal): readonly string[] {
  return [priorityLabel(classifySignalPriority(signal)), signal.category];
}

/**
 * File an issue via `gh issue create` using execFile (no shell, no
 * command-injection risk on errorMessage / title / body content).
 */
async function fileIssueForSignal(
  signal: ImprovementSignal
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  // Embed the signal key in the body so dedup is reliable on subsequent runs.
  const body = `${signal.body}\n\n---\n\n_Signal key (do not edit): \`${signal.signalKey}\` · Generated by \`improvement_review\` (#2402) · Severity: ${signal.severity}_`;

  try {
    const { stdout } = await execFileAsync('gh', [
      'issue',
      'create',
      '--title',
      signal.title,
      '--body',
      body,
      '--label',
      issueLabelsForSignal(signal).join(','),
    ]);
    const url = stdout.trim();
    if (!url.startsWith('https://')) {
      return { ok: false, error: `gh returned unexpected output: ${stdout.slice(0, 200)}` };
    }
    return { ok: true, url };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return { ok: false, error: message };
  }
}

// ============================================================================
// Handler
// ============================================================================

function safeFitnessAudit(now: number, ctx: HandlerContext): FitnessAudit {
  try {
    return calculateFitnessScore('improvement-review');
  } catch (caught) {
    ctx.logger.warn('fitness audit failed; skipping fitness signals', {
      error: caught instanceof Error ? caught.message : String(caught),
    });
    return {
      score: 100,
      dimensions: {} as FitnessAudit['dimensions'],
      findings: [],
      timestamp: new Date(now).toISOString(),
      version: 'improvement-review-fallback',
    };
  }
}

const SEVERITY_ORDER: Record<ImprovementSignal['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

async function fileSignalsAsIssues(
  signals: readonly ImprovementSignal[],
  ctx: HandlerContext
): Promise<{
  issuesFiled: { signalKey: string; issueUrl: string }[];
  issuesSkipped: { signalKey: string; reason: string }[];
}> {
  const issuesFiled: { signalKey: string; issueUrl: string }[] = [];
  const issuesSkipped: { signalKey: string; reason: string }[] = [];

  for (const signal of signals) {
    if (issuesFiled.length >= MAX_ISSUES_PER_RUN) {
      issuesSkipped.push({ signalKey: signal.signalKey, reason: 'rate-limit' });
      continue;
    }
    const existing = await existingIssueForSignal(signal.signalKey);
    if (existing !== null) {
      issuesSkipped.push({ signalKey: signal.signalKey, reason: `dup:${existing}` });
      continue;
    }
    const result = await fileIssueForSignal(signal);
    if (result.ok) {
      issuesFiled.push({ signalKey: signal.signalKey, issueUrl: result.url });
      ctx.logger.info('improvement signal filed', {
        signalKey: signal.signalKey,
        url: result.url,
      });
    } else {
      issuesSkipped.push({ signalKey: signal.signalKey, reason: `error:${result.error}` });
    }
  }

  return { issuesFiled, issuesSkipped };
}

/**
 * Read `signal.vote_rejected` events from the pipeline bus's buffered history,
 * narrowed to the lookback window. Returns `[]` if the bus is empty or every
 * event predates the window. Fail-soft: never throws into the review run.
 *
 * The bus is a per-process module singleton (event-bus.ts), so this only sees
 * rejections emitted by `consensus_vote` *in the same process* — i.e. a
 * long-lived MCP server where both tools share the buffer. In separate
 * CLI invocations the buffer starts empty and this correctly yields no signals
 * (the loop degrades to "no consensus data" rather than misreporting).
 */
function readBufferedVoteRejections(
  now: number,
  lookbackDays: number
): readonly VoteRejectedSignalEvent[] {
  const cutoff = now - lookbackDays * DAY_MS;
  return getPipelineEventBus()
    .query({ type: 'signal.vote_rejected' })
    .filter((e): e is VoteRejectedSignalEvent => e.type === 'signal.vote_rejected')
    .filter((e) => e.timestamp >= cutoff);
}

/**
 * Context-free runner exposed for both the MCP handler and the
 * `nexus-agents improvement-review` CLI subcommand (#2444). Pure dependencies
 * — pass a logger and an OutcomeStore-query result if you want to inject test
 * data; defaults read the global store and a no-op logger.
 */
/**
 * A measured benchmark suite paired with its STATIC, configured baseline map
 * (#3692/#3246). Injected — there is no global benchmark store and the baseline
 * is never auto-derived from recent runs (that would be the deferred #3230
 * adaptive control). When absent, the perf-regression detector does not run.
 */
export interface PerfRegressionInput {
  readonly result: BenchmarkSuiteResult;
  /** Static, configured baselines keyed by `"<component>::<operation>"`. */
  readonly baselines: PerfBaselineMap;
  /** Optional override of the default 20% tolerance. */
  readonly toleranceFraction?: number;
}

/**
 * Gather deterministic perf-regression signals when a benchmark+baseline is
 * injected; otherwise none. Thin wrapper around {@link detectPerfRegressionSignals}
 * so the review runner stays under the per-function line cap.
 */
function gatherPerfRegressionSignals(
  perf: PerfRegressionInput | undefined
): readonly ImprovementSignal[] {
  if (perf === undefined) return [];
  return detectPerfRegressionSignals(perf.result, perf.baselines, perf.toleranceFraction);
}

export async function runImprovementReview(
  input: ImprovementReviewInput,
  deps: {
    readonly logger?: ReturnType<typeof createLogger>;
    /**
     * Optional benchmark measurement + STATIC baseline for the deterministic
     * perf-regression detector (#3692/#3246). Surfaced-only — emitting a signal
     * never mutates a fitness/governance score. Absent → detector is a no-op.
     */
    readonly perfRegression?: PerfRegressionInput;
  } = {}
): Promise<ImprovementReviewResponse> {
  const logger = deps.logger ?? createLogger({ component: 'improvement_review' });
  const { lookbackDays, fileIssues, minSampleSize, fitnessFloor, selfEvalReportPath } = input;
  const now = Date.now();
  const windowLabel = `${String(lookbackDays)}d`;

  const allOutcomes = getOutcomeStore().query();
  const windowed = filterByLookback(allOutcomes, lookbackDays, now);
  const audit = safeFitnessAudit(now, { logger } as HandlerContext);

  // Surface high-confidence unanimous self-eval findings as tech-debt signals
  // (#3224) — opt-in via selfEvalReportPath, fail-soft (no path / bad file → none).
  const selfEvalSignals =
    selfEvalReportPath !== undefined
      ? await loadSelfEvalSignals(selfEvalReportPath, windowLabel, logger)
      : [];

  // Recurring consensus-rejection patterns (#3259). `consensus_vote` buffers a
  // `signal.vote_rejected` event per rejected plan on the pipeline bus; read the
  // buffered history (not a live subscription — this is a one-shot tool) and
  // window-filter by event timestamp before aggregating.
  const rejectionEvents = readBufferedVoteRejections(now, lookbackDays);

  // Tool-fitness deprecation + consolidation CANDIDATES from the #3851 ledger
  // (#3852, closes #3692). SUGGEST-TIER ONLY — never autonomous removal (Epic F).
  // Fail-soft: a ledger read error yields no signals (telemetry must not break
  // the review). Workspace-scoped to defeat context-poisoning (#3852 concern 1).
  const toolFitnessSignals = loadToolFitnessSignals(windowLabel);

  // Deterministic perf-regression candidates (#3692/#3246): a measured benchmark
  // vs a STATIC, configured baseline + fixed tolerance. SURFACED-ONLY — appended
  // to the signals list exactly like every other detector; nothing mutates a
  // fitness/governance score or auto-applies a remediation. Runs only when a
  // benchmark+baseline is injected (no global store; no rolling baseline → out of
  // the deferred #3230 adaptive-control scope).
  const perfRegressionSignals = gatherPerfRegressionSignals(deps.perfRegression);

  const signals: ImprovementSignal[] = [
    ...detectCliPerformanceFloor(windowed, minSampleSize, windowLabel),
    ...detectFailureCategoryConcentration(windowed, windowLabel),
    ...detectFitnessSignals(audit, fitnessFloor),
    ...detectConsensusRejectionSignals(rejectionEvents, windowLabel),
    ...selfEvalSignals,
    ...toolFitnessSignals,
    ...perfRegressionSignals,
  ];
  signals.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  // Close the self-tuning loop: a below-floor fitness audit emits
  // signal.fitness_declined onto the typed pipeline bus for the shadow
  // TuneStage (#3147; #3289 Option 2 — observability signals route through bus A).
  emitFitnessDeclinedSignal(audit, fitnessFloor, getPipelineEventBus(), logger);

  // Shadow-mode auto-remediation selector (#3540 inc.2a / #3611): record the
  // would-auto-remediate decision per signal. Logs only — executes nothing.
  shadowRecordRemediations(signals, logger);

  const { issuesFiled, issuesSkipped } = fileIssues
    ? await fileSignalsAsIssues(signals, { logger } as HandlerContext)
    : { issuesFiled: [], issuesSkipped: [] };

  return {
    window: windowLabel,
    totalOutcomes: windowed.length,
    signals,
    // #3540 increment 1: surface remediation tasks derived from the signals
    // (suggest-only — composes existing detection, no auto-invocation).
    remediationTasks: improvementSignalsToTasks(signals),
    issuesFiled,
    issuesSkipped,
  };
}

/**
 * Best-effort shadow logging of would-auto-remediate decisions (#3611). Never
 * throws — observability must not break the review tool.
 */
function shadowRecordRemediations(signals: readonly ImprovementSignal[], logger: ILogger): void {
  try {
    const shadow = recordRemediationShadow(signals);
    if (shadow.length === 0) return;
    const wouldRemediate = shadow.filter((r) => r.wouldAutoRemediate).length;
    logger.info('Auto-remediation shadow recorded (#3611 — nothing executed)', {
      signals: shadow.length,
      wouldAutoRemediate: wouldRemediate,
      humanGated: shadow.length - wouldRemediate,
    });
  } catch (err) {
    logger.warn('Auto-remediation shadow logging failed (non-fatal)', {
      error: getErrorMessage(err),
    });
  }
}

async function reviewHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = ImprovementReviewInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Validation error: ${formatZodError(parsed.error)}`,
    });
  }
  const response = await runImprovementReview(parsed.data, { logger: ctx.logger });
  return toolSuccessStructured(response as unknown as Record<string, unknown>);
}

// ============================================================================
// Registration
// ============================================================================

export type ImprovementReviewDeps = BaseMcpToolDeps;

const description =
  'Periodic threshold-gated observability-driven improvement loop. Reads OutcomeStore + ' +
  'fitness audit, surfaces patterns crossing documented thresholds as candidate findings. ' +
  'When fileIssues=true, files candidate GitHub issues via `gh issue create` (rate-limited ' +
  'to 5 per run, deduped against open issues). Never auto-merges. Replaces the deleted ' +
  'self-development engine (#2402).';

const TOOL_INPUT_SCHEMA = {
  lookbackDays: z
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe('Lookback window for outcome data, in days. Default 7.'),
  fileIssues: z
    .boolean()
    .optional()
    .describe(
      'When true, file candidate issues for crossed thresholds (default false — return signals only)'
    ),
  minSampleSize: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('Minimum sample size before a CLI/category signal fires (default 5).'),
  fitnessFloor: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe('Fitness score below this threshold triggers a tech-debt signal (default 90).'),
  selfEvalReportPath: z
    .string()
    .optional()
    .describe(
      'Optional path to a self-eval JSON report. High-confidence unanimous ' +
        'deprecate/refactor findings surface as tech-debt signals (#3224).'
    ),
};

/** @category MCP */
export function registerImprovementReviewTool(
  server: McpServer,
  deps: ImprovementReviewDeps
): void {
  const logger = deps.logger ?? createLogger({ tool: 'improvement_review' });
  const secureHandler = createSecureHandler(reviewHandler, {
    toolName: 'improvement_review',
    rateLimiter: deps.rateLimiter,
    logger,
  });
  const guardedHandler = withPrerequisite('improvement_review', secureHandler);
  const timeoutMs = getToolTimeout('improvement_review', deps.security);
  const wrappedHandler = wrapToolWithTimeout('improvement_review', guardedHandler, {
    timeoutMs,
    logger,
  });
  server.registerTool(
    'improvement_review',
    {
      description,
      inputSchema: TOOL_INPUT_SCHEMA,
      annotations: getToolAnnotations('improvement_review'),
    },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered improvement_review tool');
}
