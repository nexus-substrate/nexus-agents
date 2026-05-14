/**
 * nexus-agents/mcp - Registry Import MCP Tool
 *
 * Generates draft ModelCapability entries for adding new models
 * to the canonical registry. Quality scores default to 5/10
 * and require human review before routing trusts them.
 *
 * @module mcp/tools/registry-import-tool
 * (Source: Issue #889, Epic #888)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, formatZodError } from '../../core/index.js';
import { toolErrorResponse } from '../middleware/tool-error-handler.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { withPrerequisite } from '../middleware/tool-prerequisites.js';
import { RegistryImportInputSchema } from './registry-import-types.js';
import { generateRegistryEntry } from './registry-import.js';
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

export type RegistryImportDeps = BaseMcpToolDeps;

// ============================================================================
// Handler
// ============================================================================

function registryImportHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
  const parsed = RegistryImportInputSchema.safeParse(args);
  if (!parsed.success) {
    return Promise.resolve(
      toolStructuredError({
        errorCategory: 'validation',
        message: `Validation error: ${formatZodError(parsed.error)}`,
      })
    );
  }

  try {
    const result = generateRegistryEntry(parsed.data);
    return Promise.resolve(toolSuccess(JSON.stringify(result, null, 2)));
  } catch (caught) {
    return Promise.resolve(toolErrorResponse('Registry import failed', caught, ctx.logger));
  }
}

// ============================================================================
// Registration
// ============================================================================

/** @category MCP */
export function registerRegistryImportTool(server: McpServer, deps: RegistryImportDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'registry_import' });
  const toolSchema = {
    provider: z
      .enum(['anthropic', 'google', 'openai'])
      .describe('Model provider (anthropic, google, openai)'),
    modelId: z.string().min(1).describe('Provider model identifier'),
    dryRun: z.boolean().optional().describe('Preview without persisting (default: true)'),
  };

  const description =
    'Add an AI model to the registry. Generates a draft ModelCapability entry ' +
    'with conservative quality scores (5/10) for human review. Use dryRun=true ' +
    '(default) to preview the entry without saving.';

  const secureHandler = createSecureHandler(registryImportHandler, {
    toolName: 'registry_import',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const guardedHandler = withPrerequisite('registry_import', secureHandler);
  const timeoutMs = getToolTimeout('registry_import', deps.security);
  const wrappedHandler = wrapToolWithTimeout('registry_import', guardedHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'registry_import',
    { description, inputSchema: toolSchema, annotations: getToolAnnotations('registry_import') },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered registry_import tool');
}
