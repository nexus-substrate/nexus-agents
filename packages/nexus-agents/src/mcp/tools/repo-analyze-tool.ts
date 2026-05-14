/**
 * nexus-agents/mcp - Repository Analyze MCP Tool
 *
 * Inspects a GitHub repository and returns structured analysis
 * of its language, tooling, CI, security posture, and gaps.
 * Replaces 5-10 manual tool calls with a single structured query.
 *
 * @module mcp/tools/repo-analyze-tool
 * (Source: Issue #1074, 6-0 consensus vote)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { toolErrorResponse } from '../middleware/tool-error-handler.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { RepoAnalyzeInputSchema } from './repo-analyze-types.js';
import { analyzeGitHubRepo } from './repo-analyze.js';
import {
  toolStructuredError,
  toolSuccess,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';
import { getToolAnnotations } from '../tool-annotations.js';

// ============================================================================
// Dependencies
// ============================================================================

export type RepoAnalyzeDeps = BaseMcpToolDeps;

// ============================================================================
// Handler
// ============================================================================

async function repoAnalyzeHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = RepoAnalyzeInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Validation error: ${formatZodError(parsed.error)}`,
    });
  }

  try {
    const result = await analyzeGitHubRepo(parsed.data);
    return toolSuccess(JSON.stringify(result, null, 2));
  } catch (caught) {
    return toolErrorResponse('Repository analysis failed', caught, ctx.logger);
  }
}

// ============================================================================
// Registration
// ============================================================================

/** @category MCP */
export function registerRepoAnalyzeTool(server: McpServer, deps: RepoAnalyzeDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'repo_analyze' });
  const toolSchema = {
    repo: z.string().min(1).describe('GitHub repository in "owner/name" format or full URL'),
    depth: z
      .enum(['shallow', 'deep'])
      .optional()
      .describe('Analysis depth: shallow (tree + README) or deep'),
  };

  const description =
    'Analyze a GitHub repository structure. Returns language, framework, ' +
    'package manager, CI provider, security tooling, Dockerfile/Helm/Makefile ' +
    'detection, and gap identification. Replaces multi-step manual inspection ' +
    'with a single structured query.';

  const secureHandler = createSecureHandler(repoAnalyzeHandler, {
    toolName: 'repo_analyze',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('repo_analyze', deps.security);
  const wrappedHandler = wrapToolWithTimeout('repo_analyze', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'repo_analyze',
    { description, inputSchema: toolSchema, annotations: getToolAnnotations('repo_analyze') },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered repo_analyze tool');
}
