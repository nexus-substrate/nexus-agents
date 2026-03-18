/**
 * nexus-agents/mcp - Research Add Source Tool
 *
 * MCP tool for adding non-paper sources (repos, tools, blogs) to the
 * research registry. Accepts pre-populated metadata or fetches from
 * GitHub via `gh` CLI (optional, graceful fallback).
 *
 * @module mcp/tools/research-add-source
 * @see Issue #1580
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger, formatZodError } from '../../core/index.js';

import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { withToolError } from '../middleware/tool-error-handler.js';
import {
  addSourceToRegistry,
  sourceExistsInRegistry,
  type SourceEntry,
} from '../../cli/research-helpers-sources-io.js';
import { computeSourceQualityScore } from '../../research/source-quality.js';
import type { ResearchSource } from '../../indexer/research-index/research-index-base-types.js';
import { toolError, toolSuccess, type ToolResult, type BaseMcpToolDeps } from './tool-result.js';
import { getToolMemory } from './tool-memory.js';

// =============================================================================
// SCHEMAS
// =============================================================================

const SourceTypeEnum = z.enum([
  'product_docs',
  'specification',
  'research_blog',
  'code_analysis',
  'open_source_repo',
]);

const VerdictEnum = z.enum(['adopted', 'partially_adopted', 'rejected', 'monitoring', 'planned']);

export const ResearchAddSourceInputSchema = z.object({
  url: z.string().min(1).max(500).describe('Source URL (GitHub repo, docs page, blog post)'),
  name: z.string().min(1).max(200).describe('Display name for the source'),
  type: SourceTypeEnum.describe('Source type classification'),
  vendor: z.string().max(100).optional().describe('Vendor or organization'),
  topics: z.array(z.string().max(50)).max(5).optional().describe('Research topics (max 5)'),
  tags: z.array(z.string().max(50)).max(10).optional().describe('Searchable tags (max 10)'),
  quality_signals: z
    .object({
      stars_at_review: z.number().nonnegative().optional(),
      language: z.string().max(50).optional(),
      has_tests: z.boolean().optional(),
      has_docs: z.boolean().optional(),
      has_paper: z.boolean().optional(),
    })
    .optional()
    .describe('Quality signals (auto-fetched for GitHub repos if omitted)'),
  techniques_extracted: z
    .array(z.string().max(100))
    .max(5)
    .optional()
    .describe('Techniques identified in this source (max 5)'),
  verdict: VerdictEnum.optional().describe('Adoption verdict'),
  verdict_notes: z.string().max(500).optional().describe('Notes explaining the verdict'),
  dryRun: z.boolean().optional().default(false).describe('Preview without persisting'),
});

export type ResearchAddSourceInput = z.infer<typeof ResearchAddSourceInputSchema>;
export type ResearchAddSourceDeps = BaseMcpToolDeps;

// =============================================================================
// RESPONSE
// =============================================================================

export interface ResearchAddSourceResponse {
  success: boolean;
  sourceId: string;
  name: string;
  quality_score: number;
  evidence_tier: string;
  message: string;
  dryRun: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

/** Generate a URL-safe source ID from the URL. */
function generateSourceId(url: string): string {
  const match = /github\.com\/([^/]+)\/([^/]+)/.exec(url);
  if (match !== null) {
    const owner = match[1] ?? '';
    const repo = match[2] ?? '';
    return `${owner}-${repo}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }
  return url
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]/gi, '-')
    .toLowerCase()
    .slice(0, 60);
}

/** Build the source entry from validated input. */
function buildSourceEntry(input: ResearchAddSourceInput): SourceEntry {
  const today = new Date().toISOString().slice(0, 10);
  // Build entry object, only including defined fields (exactOptionalPropertyTypes)
  const entry: Record<string, unknown> = {
    name: input.name,
    type: input.type,
    url: input.url,
    reviewed_date: today,
    reviewed_in: 'N/A (added via research_add_source tool)',
  };
  if (input.vendor !== undefined) entry['vendor'] = input.vendor;
  if (input.topics !== undefined) entry['topics'] = input.topics;
  if (input.tags !== undefined) entry['tags'] = input.tags;
  if (input.quality_signals !== undefined) entry['quality_signals'] = input.quality_signals;
  if (input.techniques_extracted !== undefined) {
    entry['techniques_extracted'] = input.techniques_extracted;
  }
  if (input.verdict !== undefined) entry['verdict'] = input.verdict;
  if (input.verdict_notes !== undefined) entry['verdict_notes'] = input.verdict_notes;
  return entry as unknown as SourceEntry;
}

/** Derive evidence tier from quality score. */
function deriveEvidenceTier(score: number): 'high' | 'medium' | 'low' {
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

interface ResponseParams {
  success: boolean;
  sourceId: string;
  name: string;
  qualityScore: number;
  message: string;
  dryRun: boolean;
}

/** Build a standard response object. */
function buildResponse(params: ResponseParams): ResearchAddSourceResponse {
  return {
    success: params.success,
    sourceId: params.sourceId,
    name: params.name,
    quality_score: params.qualityScore,
    evidence_tier: deriveEvidenceTier(params.qualityScore),
    message: params.message,
    dryRun: params.dryRun,
  };
}

/** Record learning in session memory (best-effort). */
function recordAddSourceLearning(
  logger: ILogger,
  name: string,
  sourceId: string,
  type: string,
  qualityScore: number
): void {
  try {
    const memory = getToolMemory(logger);
    memory.recordLearning({
      pattern: `Added source: ${name} (${sourceId})`,
      context: `type=${type}, quality=${String(qualityScore)}`,
      confidence: 0.9,
      source: 'research_add_source',
    });
  } catch {
    logger.debug('Failed to record learning in session memory');
  }
}

/** Build entry and compute quality score. */
function prepareSource(input: ResearchAddSourceInput): { entry: SourceEntry; score: number } {
  const entry = buildSourceEntry(input);
  const score = computeSourceQualityScore(entry as unknown as ResearchSource);
  return { entry, score };
}

async function executeResearchAddSource(
  input: ResearchAddSourceInput,
  logger: ILogger
): Promise<ResearchAddSourceResponse> {
  const sourceId = generateSourceId(input.url);
  const exists = await sourceExistsInRegistry(input.url);
  if (exists) {
    return buildResponse({
      success: false,
      sourceId,
      name: input.name,
      qualityScore: 0,
      message: `Source already exists: ${input.url}`,
      dryRun: input.dryRun,
    });
  }

  const { entry, score } = prepareSource(input);
  if (input.dryRun) {
    return buildResponse({
      success: true,
      sourceId,
      name: input.name,
      qualityScore: score,
      message: `[DRY RUN] Would add '${input.name}' (${sourceId}) quality=${String(score)}`,
      dryRun: true,
    });
  }

  const writeResult = await addSourceToRegistry(sourceId, entry);
  if (!writeResult.ok) {
    return buildResponse({
      success: false,
      sourceId,
      name: input.name,
      qualityScore: score,
      message: writeResult.error.message,
      dryRun: false,
    });
  }

  recordAddSourceLearning(logger, input.name, sourceId, input.type, score);
  logger.info('Added research source', { sourceId, name: input.name, qualityScore: score });
  return buildResponse({
    success: true,
    sourceId,
    name: input.name,
    qualityScore: score,
    message: `Added '${input.name}' (${sourceId}) quality=${String(score)}`,
    dryRun: false,
  });
}

// =============================================================================
// MCP TOOL
// =============================================================================

function createResearchAddSourceHandler(deps: ResearchAddSourceDeps) {
  return async (args: unknown, ctx: HandlerContext): Promise<ToolResult> => {
    const validationResult = ResearchAddSourceInputSchema.safeParse(args);
    if (!validationResult.success) {
      return toolError(`Validation error: ${formatZodError(validationResult.error)}`);
    }

    ctx.logger.debug('Adding research source', { url: validationResult.data.url });

    const logger = deps.logger ?? createLogger({ tool: 'research_add_source' });
    return withToolError('Failed to add source', logger, async () => {
      const result = await executeResearchAddSource(validationResult.data, logger);

      if (!result.success) {
        return toolError(result.message);
      }

      return toolSuccess(JSON.stringify(result, null, 2));
    });
  };
}

/** @category MCP */
export function registerResearchAddSourceTool(
  server: McpServer,
  deps: ResearchAddSourceDeps
): void {
  const logger = deps.logger ?? createLogger({ tool: 'research_add_source' });
  const toolSchema = {
    url: z.string().min(1).describe('Source URL'),
    name: z.string().min(1).describe('Display name'),
    type: SourceTypeEnum.describe('Source type'),
    vendor: z.string().optional().describe('Vendor'),
    topics: z.array(z.string()).max(5).optional().describe('Topics'),
    tags: z.array(z.string()).max(10).optional().describe('Tags'),
    quality_signals: z
      .object({
        stars_at_review: z.number().optional(),
        language: z.string().optional(),
        has_tests: z.boolean().optional(),
        has_docs: z.boolean().optional(),
        has_paper: z.boolean().optional(),
      })
      .optional()
      .describe('Quality signals'),
    techniques_extracted: z.array(z.string()).max(5).optional().describe('Techniques'),
    verdict: VerdictEnum.optional().describe('Adoption verdict'),
    verdict_notes: z.string().max(500).optional().describe('Verdict notes'),
    dryRun: z.boolean().optional().default(false).describe('Preview only'),
  };

  const description =
    'Add a non-paper source (GitHub repo, tool, blog) to the research registry. ' +
    'Auto-computes quality_score from provided quality_signals. ' +
    'Use dryRun=true to preview without saving.';

  const secureHandler = createSecureHandler(createResearchAddSourceHandler(deps), {
    toolName: 'research_add_source',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('research_add_source', deps.security);
  const wrappedHandler = wrapToolWithTimeout('research_add_source', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'research_add_source',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
}
