/**
 * nexus-agents/mcp - Issue Triage Tool
 *
 * MCP tool for automated GitHub issue triage using the full
 * security pipeline (8/8 modules). Read-only by default.
 *
 * @module mcp/tools/issue-triage-tool
 * (Source: Issue #828 — Wire remaining security modules)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createLogger,
  formatZodError,
  getTimeProvider,
  getRandomProvider,
} from '../../core/index.js';
import { toolError, toolSuccess, type BaseMcpToolDeps, type ToolResult } from './tool-result.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { IssueTriage } from '../../dogfooding/issue-triage.js';
import type { IssueTriageResult } from '../../dogfooding/issue-triage-types.js';
import { getToolMemory } from './tool-memory.js';
import {
  getOutcomeStore,
  categorizeOutcomeErrorMessage,
} from '../../orchestration/outcomes/index.js';
import { DEFAULT_CLI } from '../../config/model-capabilities-types.js';
import { getToolAnnotations } from '../tool-annotations.js';

// ============================================================================
// Types
// ============================================================================

export const IssueTriageInputSchema = z.object({
  issueUrl: z
    .string()
    .min(1)
    .refine((v) => /^https?:\/\//i.test(v), 'Only HTTP/HTTPS URLs are allowed')
    .describe('GitHub issue URL (e.g., https://github.com/owner/repo/issues/123)'),
  dryRun: z
    .boolean()
    .optional()
    .default(true)
    .describe('Read-only mode (default: true). When false, may apply labels.'),
});

export type IssueTriageInput = z.infer<typeof IssueTriageInputSchema>;

export type IssueTriageDeps = BaseMcpToolDeps;

export interface IssueTriageResponse {
  readonly issueNumber: number;
  readonly repository: string;
  readonly category: string;
  readonly categoryConfidence: number;
  readonly trustAssessment: {
    readonly trustTier: string;
    readonly userRole: string;
    readonly reputationScore?: number | undefined;
    readonly isSuspicious: boolean;
    readonly suspiciousSignals: readonly string[];
  };
  readonly proposedActions: ReadonlyArray<{
    readonly type: string;
    readonly description: string;
    readonly policyApproved: boolean;
    readonly corroborated: boolean;
  }>;
  readonly durationMs: number;
}

// ============================================================================
// Handler
// ============================================================================

/** Builds the structured triage response from raw triage result. */
function buildTriageResponse(value: IssueTriageResult): IssueTriageResponse {
  return {
    issueNumber: value.issueNumber,
    repository: value.repository,
    category: value.category,
    categoryConfidence: value.categoryConfidence,
    trustAssessment: {
      trustTier: value.trustAssessment.trustTier,
      userRole: value.trustAssessment.userRole,
      reputationScore: value.trustAssessment.reputationScore,
      isSuspicious: value.trustAssessment.isSuspicious,
      suspiciousSignals: value.trustAssessment.suspiciousSignals,
    },
    proposedActions: value.proposedActions.map((a) => ({
      type: a.type,
      description: a.description,
      policyApproved: a.policyApproved,
      corroborated: a.corroborated,
    })),
    durationMs: value.totalDurationMs,
  };
}

function createIssueTriageHandler(_deps: IssueTriageDeps) {
  return async (args: unknown, ctx: HandlerContext): Promise<ToolResult> => {
    const validationResult = IssueTriageInputSchema.safeParse(args);
    if (!validationResult.success) {
      return toolError(`Validation error: ${formatZodError(validationResult.error)}`);
    }

    const input = validationResult.data;
    ctx.logger.info('Starting issue triage', { issueUrl: input.issueUrl, dryRun: input.dryRun });

    const startMs = Date.now();
    const triage = new IssueTriage({ dryRun: input.dryRun });
    const result = await triage.triageIssue(input.issueUrl);
    const durationMs = Date.now() - startMs;

    if (!result.ok) {
      recordTriageOutcome(false, durationMs, result.error.message);
      return toolError(`Triage failed: ${result.error.message}`);
    }

    recordTriageSuccess(result.value.category, result.value.categoryConfidence, durationMs);
    recordTriageOutcome(true, durationMs);
    const response = buildTriageResponse(result.value);

    return toolSuccess(JSON.stringify(response, null, 2));
  };
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Registers the issue_triage tool with the MCP server.
 * Uses createSecureHandler for rate limiting and input sanitization.
 * @category MCP
 */
export function registerIssueTriageTool(server: McpServer, deps: IssueTriageDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'issue_triage' });
  const toolSchema = {
    issueUrl: z
      .string()
      .min(1)
      .describe('GitHub issue URL (e.g., https://github.com/owner/repo/issues/123)'),
    dryRun: z.boolean().optional().default(true).describe('Read-only mode (default: true)'),
  };

  const description =
    'Triage a GitHub issue using the full security pipeline. ' +
    'Classifies the issue, assesses author trust and reputation, ' +
    'proposes labels and actions, and validates all outputs through ' +
    'policy gate and corroboration checks. Read-only by default. ' +
    'Requires GITHUB_TOKEN or GH_TOKEN environment variable, or gh CLI auth.';

  const secureHandler = createSecureHandler(createIssueTriageHandler(deps), {
    toolName: 'issue_triage',
    securityTier: 'external',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('issue_triage', deps.security);
  const wrappedHandler = wrapToolWithTimeout('issue_triage', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'issue_triage',
    { description, inputSchema: toolSchema, annotations: getToolAnnotations('issue_triage') },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered issue_triage tool with secure handler and timeout protection');
}

// ============================================================================
// Recording Helpers (Issue #1174)
// ============================================================================

const triageLogger = createLogger({ tool: 'issue-triage' });

/** Records a successful issue triage to session memory. Best-effort. */
function recordTriageSuccess(category: string, confidence: number, durationMs: number): void {
  try {
    const memory = getToolMemory();
    memory.recordTask({
      approach: `Issue triage: ${category} (confidence: ${String(confidence)})`,
      challenges: [],
      durationMs,
    });
    memory.recordLearning({
      pattern: `triage → ${category}`,
      context: `confidence=${String(confidence)} duration=${String(durationMs)}ms`,
      confidence: 0.8,
      source: 'manual',
    });
  } catch (error: unknown) {
    triageLogger.warn('Failed to record triage success', { error: String(error) });
  }
}

/** Records triage outcome for adaptive routing. Best-effort. */
function recordTriageOutcome(success: boolean, durationMs: number, errorMsg?: string): void {
  try {
    if (!success && errorMsg !== undefined) {
      const memory = getToolMemory();
      memory.recordError({
        error: `Issue triage failed: ${errorMsg.slice(0, 150)}`,
        solution: 'Check GitHub token and issue URL',
        filePattern: 'mcp/tools/issue-triage-tool',
      });
    }
    const store = getOutcomeStore();
    store.append({
      id: `triage-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 8)}`,
      cli: DEFAULT_CLI,
      category: 'planning',
      model: 'issue-triage',
      success,
      durationMs,
      timestamp: new Date().toISOString(),
      source: 'manual',
      ...(!success && errorMsg !== undefined
        ? {
            failureCategory: categorizeOutcomeErrorMessage(errorMsg),
            errorMessage: errorMsg.slice(0, 500),
          }
        : {}),
    });
  } catch (storeErr: unknown) {
    triageLogger.debug('Failed to record triage outcome to store', {
      error: storeErr instanceof Error ? storeErr.message : String(storeErr),
    });
  }
}
