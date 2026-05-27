/**
 * `ci_health_check` MCP tool (#3076).
 *
 * Read-only diagnostic surface for "is CI working right now?". Composes two
 * signals an autonomous agent would otherwise have to derive by grepping
 * failed-CI logs:
 *
 * 1. **GitHub status page** — `https://www.githubstatus.com/api/v2/components.json`
 *    reports per-component health. The `GitHub Actions` component flips to
 *    `degraded_performance` / `partial_outage` / `major_outage` during the
 *    kind of incident #3076 describes.
 * 2. **Recent-runs activity window** — query the configured repo's
 *    `actions/runs` endpoint over a short window. When the status page says
 *    "operational" but no runs have completed for the repo in ~30 min
 *    despite recent push events, the repo is locally wedged (the failure
 *    mode I personally hit on 2026-05-26 — global status was operational
 *    but our org's queue was dead for >90 min, per #3070).
 *
 * Combined verdict prefers the more pessimistic of the two signals. If the
 * status page says outage, return outage. If the status page is healthy but
 * the local repo has been silent for too long, return degraded (operator
 * can still act, but with the warning).
 *
 * Read-only, idempotent. No state mutated. Network calls go to GitHub
 * status + GitHub API only (both are already accessed by other tools).
 *
 * @module mcp/tools/ci-health-check-tool
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createLogger, formatZodError, type ILogger } from '../../core/index.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler } from '../middleware/secure-handler.js';
import {
  toolStructuredError,
  toolSuccess,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';
import { getToolAnnotations } from '../tool-annotations.js';

/** Combined health verdict. `degraded` means partial — operator can still ship with caution. */
export const CiHealthStatusSchema = z.enum(['healthy', 'degraded', 'outage', 'unknown']);
export type CiHealthStatus = z.infer<typeof CiHealthStatusSchema>;

export const CiHealthCheckInputSchema = z.object({
  /**
   * Repo to check for the recent-runs activity signal (in `owner/repo` form).
   * Optional — when omitted, only the status-page signal is consulted.
   */
  repo: z
    .string()
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'Must be owner/repo form')
    .optional()
    .describe('GitHub repo (owner/repo) to check for recent CI activity. Optional.'),
  /**
   * How far back to look for recent-runs activity (minutes). Default 30 —
   * matches the typical wedge-detection window from the #3070 / #3076 outages.
   */
  activityWindowMinutes: z
    .number()
    .int()
    .min(5)
    .max(180)
    .default(30)
    .describe('Recent-runs lookback window in minutes (5-180; default 30).'),
});
export type CiHealthCheckInput = z.infer<typeof CiHealthCheckInputSchema>;

/** Per-signal evidence the tool returns alongside the combined verdict. */
export interface CiHealthSignal {
  readonly source: 'github-status' | 'repo-activity-window';
  readonly status: CiHealthStatus;
  readonly evidence: string;
}

export interface CiHealthCheckResponse {
  readonly status: CiHealthStatus;
  readonly checkedAt: string;
  readonly signals: readonly CiHealthSignal[];
}

export type CiHealthCheckDeps = BaseMcpToolDeps;

const STATUS_PAGE_URL = 'https://www.githubstatus.com/api/v2/components.json';

/**
 * Map GitHub's component-status string onto our discriminator. The status
 * page uses `operational | degraded_performance | partial_outage | major_outage | under_maintenance`.
 */
function mapStatusPageStatus(raw: string): CiHealthStatus {
  if (raw === 'operational') return 'healthy';
  if (raw === 'degraded_performance' || raw === 'under_maintenance') return 'degraded';
  if (raw === 'partial_outage' || raw === 'major_outage') return 'outage';
  return 'unknown';
}

/** Fetch GitHub's component status and extract the `GitHub Actions` row. */
async function checkGithubStatus(logger: ILogger): Promise<CiHealthSignal> {
  try {
    const res = await fetch(STATUS_PAGE_URL, {
      // 5s budget — status page is fast, hangs here are themselves a degraded signal.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return {
        source: 'github-status',
        status: 'unknown',
        evidence: `status page returned HTTP ${String(res.status)}`,
      };
    }
    const payload = (await res.json()) as {
      components?: Array<{ name?: string; status?: string }>;
    };
    const actions = payload.components?.find((c) => c.name === 'GitHub Actions');
    if (actions?.status === undefined) {
      return {
        source: 'github-status',
        status: 'unknown',
        evidence: 'GitHub Actions component not found in status page response',
      };
    }
    return {
      source: 'github-status',
      status: mapStatusPageStatus(actions.status),
      evidence: `GitHub Actions component reports: ${actions.status}`,
    };
  } catch (err) {
    logger.warn('Status page fetch failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // A failed status-page fetch is itself a degraded signal — we can't
    // confirm health. Don't escalate to outage (the page may just be down).
    return {
      source: 'github-status',
      status: 'unknown',
      evidence: `status page fetch failed: ${err instanceof Error ? err.message : 'network error'}`,
    };
  }
}

/** Count workflow runs whose `created_at` is at or after `sinceMs`. */
function countRecentRuns(runs: ReadonlyArray<{ created_at?: string }>, sinceMs: number): number {
  return runs.filter((r) => r.created_at !== undefined && Date.parse(r.created_at) >= sinceMs)
    .length;
}

/**
 * Check the configured repo's recent-runs activity. When the repo has had
 * no run-status updates in `windowMinutes` despite known recent pushes,
 * the local queue is wedged even if the global status page is green.
 */
async function checkRepoActivity(
  repo: string,
  windowMinutes: number,
  logger: ILogger
): Promise<CiHealthSignal> {
  const sinceMs = Date.now() - windowMinutes * 60_000;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=30`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      return {
        source: 'repo-activity-window',
        status: 'unknown',
        evidence: `actions/runs API returned HTTP ${String(res.status)}`,
      };
    }
    const payload = (await res.json()) as {
      workflow_runs?: Array<{ created_at?: string; status?: string }>;
    };
    const recentCount = countRecentRuns(payload.workflow_runs ?? [], sinceMs);
    if (recentCount === 0) {
      // Zero activity in the window. Could be a quiet repo OR a wedge —
      // we can't distinguish without push-event data. Surface as degraded
      // and let the caller decide.
      return {
        source: 'repo-activity-window',
        status: 'degraded',
        evidence: `no workflow runs in last ${String(windowMinutes)} min on ${repo} — could be wedge or quiet repo`,
      };
    }
    return {
      source: 'repo-activity-window',
      status: 'healthy',
      evidence: `${String(recentCount)} workflow run(s) in last ${String(windowMinutes)} min on ${repo}`,
    };
  } catch (err) {
    logger.warn('Repo activity check failed', {
      repo,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      source: 'repo-activity-window',
      status: 'unknown',
      evidence: `actions/runs API fetch failed: ${err instanceof Error ? err.message : 'network error'}`,
    };
  }
}

/**
 * Combine per-signal verdicts into one overall status. Pessimistic — pick
 * the worst non-`unknown` status; if all signals are `unknown`, return
 * `unknown` (caller should treat as "no signal" not "healthy by default").
 */
function combineSignals(signals: readonly CiHealthSignal[]): CiHealthStatus {
  const PRIORITY: Record<CiHealthStatus, number> = {
    outage: 3,
    degraded: 2,
    healthy: 1,
    unknown: 0,
  };
  let worst: CiHealthStatus = 'unknown';
  for (const s of signals) {
    if (s.status !== 'unknown' && PRIORITY[s.status] > PRIORITY[worst]) {
      worst = s.status;
    }
  }
  return worst;
}

async function ciHealthCheckHandler(args: unknown, logger: ILogger): Promise<ToolResult> {
  const parsed = CiHealthCheckInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Validation error: ${formatZodError(parsed.error)}`,
    });
  }
  const { repo, activityWindowMinutes } = parsed.data;

  const signals: CiHealthSignal[] = [];
  signals.push(await checkGithubStatus(logger));
  if (repo !== undefined) {
    signals.push(await checkRepoActivity(repo, activityWindowMinutes, logger));
  }

  const response: CiHealthCheckResponse = {
    status: combineSignals(signals),
    checkedAt: new Date().toISOString(),
    signals,
  };
  return toolSuccess(JSON.stringify(response, null, 2));
}

const DESCRIPTION =
  'Check CI infrastructure health before triggering / polling runs (#3076). ' +
  'Returns { status: healthy|degraded|outage|unknown, signals } composing ' +
  "GitHub status-page state + the configured repo's recent workflow-runs " +
  'activity. Use BEFORE a long auto-merge wait to skip the wedge cycle ' +
  'when CI is broken org-wide. Read-only, idempotent, no network state mutated.';

/** @category MCP */
export function registerCiHealthCheckTool(server: McpServer, deps: CiHealthCheckDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'ci_health_check' });
  const toolSchema = {
    repo: z
      .string()
      .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'Must be owner/repo form')
      .optional()
      .describe('GitHub repo (owner/repo) to check for recent CI activity. Optional.'),
    activityWindowMinutes: z
      .number()
      .int()
      .min(5)
      .max(180)
      .optional()
      .describe('Recent-runs lookback window in minutes (5-180; default 30).'),
  };

  const secureHandler = createSecureHandler((args: unknown) => ciHealthCheckHandler(args, logger), {
    toolName: 'ci_health_check',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('ci_health_check', deps.security);
  const wrappedHandler = wrapToolWithTimeout('ci_health_check', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'ci_health_check',
    {
      description: DESCRIPTION,
      inputSchema: toolSchema,
      annotations: getToolAnnotations('ci_health_check'),
    },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered ci_health_check tool');
}
