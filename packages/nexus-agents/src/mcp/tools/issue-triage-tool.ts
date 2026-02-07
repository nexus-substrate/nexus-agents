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
import type { ILogger } from '../../core/index.js';
import { createLogger, formatZodError } from '../../core/index.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { IssueTriage } from '../../dogfooding/issue-triage.js';

// ============================================================================
// Types
// ============================================================================

export const IssueTriageInputSchema = z.object({
  issueUrl: z
    .string()
    .min(1)
    .describe('GitHub issue URL (e.g., https://github.com/owner/repo/issues/123)'),
  dryRun: z
    .boolean()
    .optional()
    .default(true)
    .describe('Read-only mode (default: true). When false, may apply labels.'),
});

export type IssueTriageInput = z.infer<typeof IssueTriageInputSchema>;

export interface IssueTriageDeps {
  logger?: ILogger;
  rateLimiter: RateLimiter;
  security?: SecurityConfig | undefined;
}

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

type IssueTriageToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function createIssueTriageHandler(_deps: IssueTriageDeps) {
  return async (args: unknown, ctx: HandlerContext): Promise<IssueTriageToolResponse> => {
    const validationResult = IssueTriageInputSchema.safeParse(args);
    if (!validationResult.success) {
      return {
        isError: true,
        content: [
          { type: 'text', text: `Validation error: ${formatZodError(validationResult.error)}` },
        ],
      };
    }

    const input = validationResult.data;
    ctx.logger.info('Starting issue triage', { issueUrl: input.issueUrl, dryRun: input.dryRun });

    const triage = new IssueTriage({ dryRun: input.dryRun });
    const result = await triage.triageIssue(input.issueUrl);

    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Triage failed: ${result.error.message}` }],
      };
    }

    const response: IssueTriageResponse = {
      issueNumber: result.value.issueNumber,
      repository: result.value.repository,
      category: result.value.category,
      categoryConfidence: result.value.categoryConfidence,
      trustAssessment: {
        trustTier: result.value.trustAssessment.trustTier,
        userRole: result.value.trustAssessment.userRole,
        reputationScore: result.value.trustAssessment.reputationScore,
        isSuspicious: result.value.trustAssessment.isSuspicious,
        suspiciousSignals: result.value.trustAssessment.suspiciousSignals,
      },
      proposedActions: result.value.proposedActions.map((a) => ({
        type: a.type,
        description: a.description,
        policyApproved: a.policyApproved,
        corroborated: a.corroborated,
      })),
      durationMs: result.value.totalDurationMs,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    };
  };
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Registers the issue_triage tool with the MCP server.
 * Uses createSecureHandler for rate limiting and input sanitization.
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
    'policy gate and corroboration checks. Read-only by default.';

  const secureHandler = createSecureHandler(createIssueTriageHandler(deps), {
    toolName: 'issue_triage',
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
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered issue_triage tool with secure handler and timeout protection');
}
