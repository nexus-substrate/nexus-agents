/**
 * nexus-agents/mcp - Repository Security Plan MCP Tool
 *
 * Generates a language-aware security scanning pipeline recommendation
 * by analyzing a repository and mapping it to the vulnerability scanner registry.
 *
 * @module mcp/tools/repo-security-plan-tool
 * (Source: Issue #1079, 3-0 consensus vote)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { toolErrorResponse } from '../middleware/tool-error-handler.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { RepoSecurityPlanInputSchema } from './repo-security-plan-types.js';
import { generateSecurityPlan } from './repo-security-plan.js';
import { toolError, toolSuccess, type BaseMcpToolDeps, type ToolResult } from './tool-result.js';

// ============================================================================
// Dependencies
// ============================================================================

export type RepoSecurityPlanDeps = BaseMcpToolDeps;

// ============================================================================
// Handler
// ============================================================================

async function handler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = RepoSecurityPlanInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolError(`Validation error: ${formatZodError(parsed.error)}`);
  }

  try {
    const plan = await generateSecurityPlan(parsed.data);
    return toolSuccess(JSON.stringify(plan, null, 2));
  } catch (caught) {
    return toolErrorResponse('Security plan generation failed', caught, ctx.logger);
  }
}

// ============================================================================
// Registration
// ============================================================================

export function registerRepoSecurityPlanTool(server: McpServer, deps: RepoSecurityPlanDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'repo_security_plan' });
  const toolSchema = {
    repo: z.string().min(1).describe('GitHub repository in "owner/name" format or full URL'),
    categories: z
      .array(z.string().max(50))
      .max(10)
      .optional()
      .describe('Filter to specific categories (e.g., ["sast", "sca", "secrets"])'),
    maxScanners: z
      .number()
      .min(1)
      .max(20)
      .optional()
      .describe('Maximum scanners to recommend (default: 10)'),
  };

  const description =
    'Generate a security scanning pipeline recommendation for a GitHub repository. ' +
    'Analyzes repo structure, detects languages/frameworks, and recommends specific ' +
    'vulnerability scanners with CI config snippets. Powered by the vulnerability ' +
    'scanner registry with provenance-tracked metrics.';

  const secureHandler = createSecureHandler(handler, {
    toolName: 'repo_security_plan',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('repo_security_plan', deps.security);
  const wrappedHandler = wrapToolWithTimeout('repo_security_plan', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'repo_security_plan',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered repo_security_plan tool');
}
