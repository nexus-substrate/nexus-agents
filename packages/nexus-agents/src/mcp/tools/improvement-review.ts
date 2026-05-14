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
import { promisify } from 'node:util';
/* eslint-disable max-lines */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  toolError,
  toolSuccessStructured,
  type ToolResult,
  type BaseMcpToolDeps,
} from './tool-result.js';
import { getOutcomeStore } from '../../orchestration/outcomes/outcome-store.js';
import type { TaskOutcome } from '../../orchestration/outcomes/outcome-types.js';
import { calculateFitnessScore, type FitnessAudit } from '../../governance/fitness-score.js';
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
});

export type ImprovementReviewInput = z.infer<typeof ImprovementReviewInputSchema>;

export type SignalCategory = 'routing' | 'tech-debt' | 'bug' | 'security';

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
 * Detect CLI × category pairs whose success rate has fallen below the
 * performance floor with at least minSamples observations.
 *
 * Threshold: success rate < 60% AND samples >= minSamples.
 */
export function detectCliPerformanceFloor(
  outcomes: readonly TaskOutcome[],
  minSamples: number,
  windowLabel: string
): readonly ImprovementSignal[] {
  const buckets = new Map<string, { cli: string; category: string; ok: number; total: number }>();
  for (const o of outcomes) {
    const key = `${o.cli}::${o.category}`;
    const bucket = buckets.get(key) ?? { cli: o.cli, category: o.category, ok: 0, total: 0 };
    bucket.total += 1;
    if (o.success) bucket.ok += 1;
    buckets.set(key, bucket);
  }

  const signals: ImprovementSignal[] = [];
  for (const b of buckets.values()) {
    if (b.total < minSamples) continue;
    const rate = b.ok / b.total;
    if (rate >= 0.6) continue;
    const ratePct = Math.round(rate * 100);
    signals.push({
      category: 'routing',
      signalKey: `routing:cli-floor:${b.cli}:${b.category}`,
      severity: rate < 0.4 ? 'critical' : 'warning',
      title: `routing: ${b.cli} success rate ${String(ratePct)}% on ${b.category} (${windowLabel})`,
      body: [
        `Observed performance floor breach in the ${windowLabel} window.`,
        '',
        `- CLI: \`${b.cli}\``,
        `- Category: \`${b.category}\``,
        `- Success rate: ${String(ratePct)}% (${String(b.ok)}/${String(b.total)})`,
        `- Threshold: 60% with ≥${String(minSamples)} samples`,
        '',
        'Consider routing this category away from this CLI, or investigating the failure pattern via `weather_report` and the OutcomeStore.',
      ].join('\n'),
      evidence: {
        samples: b.total,
        window: windowLabel,
        observedValue: rate,
        threshold: 0.6,
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
  if (audit.score < fitnessFloor) signals.push(buildFloorSignal(audit, fitnessFloor));
  for (const finding of audit.findings) {
    if (finding.severity === 'critical') signals.push(buildCriticalFindingSignal(finding));
  }
  return signals;
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
    const { stdout } = await execFileAsync('gh', [
      'issue',
      'list',
      '--state',
      'open',
      '--search',
      `"${signalKey}" in:body`,
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
 * File an issue via `gh issue create` using execFile (no shell, no
 * command-injection risk on errorMessage / title / body content).
 */
async function fileIssueForSignal(
  signal: ImprovementSignal
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  // Embed the signal key in the body so dedup is reliable on subsequent runs.
  const body = `${signal.body}\n\n---\n\n_Signal key (do not edit): \`${signal.signalKey}\` · Generated by \`improvement_review\` (#2402) · Severity: ${signal.severity}_`;
  const labels = signal.category === 'security' ? 'security' : signal.category;

  try {
    const { stdout } = await execFileAsync('gh', [
      'issue',
      'create',
      '--title',
      signal.title,
      '--body',
      body,
      '--label',
      labels,
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
 * Context-free runner exposed for both the MCP handler and the
 * `nexus-agents improvement-review` CLI subcommand (#2444). Pure dependencies
 * — pass a logger and an OutcomeStore-query result if you want to inject test
 * data; defaults read the global store and a no-op logger.
 */
export async function runImprovementReview(
  input: ImprovementReviewInput,
  deps: { readonly logger?: ReturnType<typeof createLogger> } = {}
): Promise<ImprovementReviewResponse> {
  const logger = deps.logger ?? createLogger({ component: 'improvement_review' });
  const { lookbackDays, fileIssues, minSampleSize, fitnessFloor } = input;
  const now = Date.now();
  const windowLabel = `${String(lookbackDays)}d`;

  const allOutcomes = getOutcomeStore().query();
  const windowed = filterByLookback(allOutcomes, lookbackDays, now);
  const audit = safeFitnessAudit(now, { logger } as HandlerContext);

  const signals: ImprovementSignal[] = [
    ...detectCliPerformanceFloor(windowed, minSampleSize, windowLabel),
    ...detectFailureCategoryConcentration(windowed, windowLabel),
    ...detectFitnessSignals(audit, fitnessFloor),
  ];
  signals.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const { issuesFiled, issuesSkipped } = fileIssues
    ? await fileSignalsAsIssues(signals, { logger } as HandlerContext)
    : { issuesFiled: [], issuesSkipped: [] };

  return {
    window: windowLabel,
    totalOutcomes: windowed.length,
    signals,
    issuesFiled,
    issuesSkipped,
  };
}

async function reviewHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = ImprovementReviewInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolError(`Validation error: ${formatZodError(parsed.error)}`);
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
  const timeoutMs = getToolTimeout('improvement_review', deps.security);
  const wrappedHandler = wrapToolWithTimeout('improvement_review', secureHandler, {
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
