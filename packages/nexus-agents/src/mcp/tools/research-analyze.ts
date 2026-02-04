/**
 * nexus-agents/mcp - Research Analyze Tool
 *
 * MCP tool for analyzing the research registry for gaps, trends,
 * priorities, stale entries, and coverage.
 *
 * @module mcp/tools/research-analyze
 * (Source: Research System Enhancement - Phase 1D)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger, formatZodError } from '../../core/index.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { loadTechniquesRegistry, loadPapersRegistry } from '../../cli/research-helpers.js';

// =============================================================================
// SCHEMAS
// =============================================================================

/** Analysis focus areas. */
export type AnalysisFocus = 'gaps' | 'trends' | 'priorities' | 'stale' | 'coverage';

/**
 * Input schema for research_analyze tool.
 */
export const ResearchAnalyzeInputSchema = z.object({
  focus: z
    .enum(['gaps', 'trends', 'priorities', 'stale', 'coverage'])
    .describe(
      'Analysis focus: gaps (missing coverage), trends (topic distribution), priorities (P1/P2 backlog), stale (outdated entries), coverage (implementation status)'
    ),
  topic: z.string().optional().describe('Optional topic filter to narrow analysis'),
});

/**
 * Type for validated research analyze input.
 */
export type ResearchAnalyzeInput = z.infer<typeof ResearchAnalyzeInputSchema>;

// =============================================================================
// DEPS
// =============================================================================

/**
 * Dependencies for research_analyze tool.
 */
export interface ResearchAnalyzeDeps {
  /** Optional logger */
  logger?: ILogger;
  /** Rate limiter for throttling tool calls (required) */
  rateLimiter: RateLimiter;
  /** Security configuration (includes timeout settings) */
  security?: SecurityConfig | undefined;
}

// =============================================================================
// RESPONSE
// =============================================================================

/**
 * Response from research_analyze tool.
 */
export interface ResearchAnalyzeResponse {
  /** Analysis focus that was performed */
  focus: string;
  /** Whether the analysis succeeded */
  success: boolean;
  /** Analysis results */
  analysis: unknown;
  /** Recommendations based on analysis */
  recommendations: string[];
}

// =============================================================================
// ANALYSIS FUNCTIONS
// =============================================================================

/** Creates a failure response for a given focus. */
function failureResponse(focus: string): ResearchAnalyzeResponse {
  return {
    focus,
    success: false,
    analysis: { error: 'Failed to load techniques registry' },
    recommendations: [],
  };
}

/** Count occurrences by key in a collection. */
function countByKey<T>(items: T[], keyFn: (item: T) => string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    for (const key of keyFn(item)) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

/** Analyze gaps in research coverage. */
async function analyzeGaps(topic?: string): Promise<ResearchAnalyzeResponse> {
  const techResult = await loadTechniquesRegistry();
  const paperResult = await loadPapersRegistry();
  if (!techResult.ok) return failureResponse('gaps');

  const techniques = techResult.value.techniques;
  const papers = paperResult.ok ? paperResult.value.papers : {};

  const techniquesWithoutPapers = Object.entries(techniques)
    .filter(([, t]) => topic === undefined || t.topic === topic)
    .filter(([, t]) => t.source_papers.length === 0)
    .map(([id, t]) => ({ id, name: t.name, topic: t.topic }));

  const topicPaperCount = countByKey(Object.values(papers), (p) => [...p.topics]);
  const topicTechCount = countByKey(Object.values(techniques), (t) => [t.topic]);

  const underResearchedTopics = Object.entries(topicTechCount)
    .filter(([t]) => (topicPaperCount[t] ?? 0) < 2)
    .map(([t, count]) => ({
      topic: t,
      techniqueCount: count,
      paperCount: topicPaperCount[t] ?? 0,
    }));

  const recommendations: string[] = [];
  if (techniquesWithoutPapers.length > 0) {
    recommendations.push(`${String(techniquesWithoutPapers.length)} techniques lack source papers`);
  }
  if (underResearchedTopics.length > 0) {
    recommendations.push(`${String(underResearchedTopics.length)} topics have fewer than 2 papers`);
  }

  return {
    focus: 'gaps',
    success: true,
    analysis: { techniquesWithoutPapers, underResearchedTopics },
    recommendations,
  };
}

/** Analyze topic distribution trends. */
async function analyzeTrends(topic?: string): Promise<ResearchAnalyzeResponse> {
  const techResult = await loadTechniquesRegistry();
  if (!techResult.ok) {
    return {
      focus: 'trends',
      success: false,
      analysis: { error: 'Failed to load techniques registry' },
      recommendations: [],
    };
  }

  const techniques = techResult.value.techniques;
  const topicStats: Record<string, { total: number; implemented: number; planned: number }> = {};

  for (const tech of Object.values(techniques)) {
    if (topic !== undefined && tech.topic !== topic) continue;
    const stats = topicStats[tech.topic] ?? { total: 0, implemented: 0, planned: 0 };
    stats.total++;
    if (tech.status === 'implemented') stats.implemented++;
    if (tech.status === 'planned' || tech.status === 'in-progress') stats.planned++;
    topicStats[tech.topic] = stats;
  }

  const sortedTopics = Object.entries(topicStats)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([name, stats]) => ({
      topic: name,
      ...stats,
      implementationRate: stats.total > 0 ? Math.round((stats.implemented / stats.total) * 100) : 0,
    }));

  const recommendations: string[] = [];
  const lowImplTopics = sortedTopics.filter((t) => t.implementationRate < 50 && t.total >= 3);
  if (lowImplTopics.length > 0) {
    recommendations.push(
      `Topics with low implementation rate: ${lowImplTopics.map((t) => t.topic).join(', ')}`
    );
  }

  return {
    focus: 'trends',
    success: true,
    analysis: { topicDistribution: sortedTopics },
    recommendations,
  };
}

/** Check if technique is actionable (not done/rejected). */
function isActionable(status: string): boolean {
  return status !== 'implemented' && status !== 'rejected';
}

/** Build priority backlog from techniques. */
function buildPriorityBacklog(
  techniques: Record<
    string,
    { name: string; topic: string; status: string; priority: string | null }
  >,
  topic?: string
): Record<string, Array<{ id: string; name: string; topic: string; status: string }>> {
  const backlog: Record<
    string,
    Array<{ id: string; name: string; topic: string; status: string }>
  > = {
    P1: [],
    P2: [],
    P3: [],
    P4: [],
    unset: [],
  };
  for (const [id, tech] of Object.entries(techniques)) {
    if (topic !== undefined && tech.topic !== topic) continue;
    if (!isActionable(tech.status)) continue;
    const priority = tech.priority ?? 'unset';
    backlog[priority]?.push({ id, name: tech.name, topic: tech.topic, status: tech.status });
  }
  return backlog;
}

/** Analyze priority backlog. */
async function analyzePriorities(topic?: string): Promise<ResearchAnalyzeResponse> {
  const techResult = await loadTechniquesRegistry();
  if (!techResult.ok) return failureResponse('priorities');

  const backlog = buildPriorityBacklog(techResult.value.techniques, topic);
  const recommendations: string[] = [];
  const p1Count = backlog['P1']?.length ?? 0;
  const unsetCount = backlog['unset']?.length ?? 0;
  if (p1Count > 5) recommendations.push(`${String(p1Count)} P1 items in backlog`);
  if (unsetCount > 0) recommendations.push(`${String(unsetCount)} techniques lack priority`);

  return { focus: 'priorities', success: true, analysis: { backlog }, recommendations };
}

/** Analyze stale entries. */
async function analyzeStale(topic?: string): Promise<ResearchAnalyzeResponse> {
  const techResult = await loadTechniquesRegistry();
  if (!techResult.ok) {
    return {
      focus: 'stale',
      success: false,
      analysis: { error: 'Failed to load techniques registry' },
      recommendations: [],
    };
  }

  const techniques = techResult.value.techniques;
  const staleEntries: Array<{ id: string; name: string; status: string; reason: string }> = [];

  for (const [id, tech] of Object.entries(techniques)) {
    if (topic !== undefined && tech.topic !== topic) continue;
    // Planned but no implementation issue
    if (tech.status === 'planned' && tech.implementation_issue === null) {
      staleEntries.push({
        id,
        name: tech.name,
        status: tech.status,
        reason: 'Planned but no implementation issue created',
      });
    }
    // In-progress without recent decision history
    if (tech.status === 'in-progress' && tech.decision_history.length === 0) {
      staleEntries.push({
        id,
        name: tech.name,
        status: tech.status,
        reason: 'In-progress but no decision history',
      });
    }
  }

  const recommendations: string[] = [];
  if (staleEntries.length > 0) {
    recommendations.push(`${String(staleEntries.length)} entries may be stale - review and update`);
  }

  return {
    focus: 'stale',
    success: true,
    analysis: { staleEntries, staleCount: staleEntries.length },
    recommendations,
  };
}

/** Count techniques by status category. */
function countTechniqueStatuses(
  techniques: Record<string, { topic: string; status: string }>,
  topic?: string
): { total: number; implemented: number; planned: number; notStarted: number; rejected: number } {
  const counts = { total: 0, implemented: 0, planned: 0, notStarted: 0, rejected: 0 };
  const statusMap: Record<string, keyof typeof counts> = {
    implemented: 'implemented',
    planned: 'planned',
    'in-progress': 'planned',
    'not-started': 'notStarted',
    rejected: 'rejected',
  };
  for (const tech of Object.values(techniques)) {
    if (topic !== undefined && tech.topic !== topic) continue;
    counts.total++;
    const key = statusMap[tech.status];
    if (key !== undefined) counts[key]++;
  }
  return counts;
}

/** Analyze implementation coverage. */
async function analyzeCoverage(topic?: string): Promise<ResearchAnalyzeResponse> {
  const techResult = await loadTechniquesRegistry();
  if (!techResult.ok) return failureResponse('coverage');

  const counts = countTechniqueStatuses(techResult.value.techniques, topic);
  const implementationRate =
    counts.total > 0 ? Math.round((counts.implemented / counts.total) * 100) : 0;

  const recommendations: string[] = [];
  if (implementationRate < 50) recommendations.push('Implementation rate below 50%');
  if (counts.notStarted > counts.implemented)
    recommendations.push('More not-started than implemented');

  return {
    focus: 'coverage',
    success: true,
    analysis: { ...counts, implementationRate, topicFilter: topic ?? 'all' },
    recommendations,
  };
}

/** Routes to the correct analysis handler. */
async function executeAnalysis(input: ResearchAnalyzeInput): Promise<ResearchAnalyzeResponse> {
  switch (input.focus) {
    case 'gaps':
      return analyzeGaps(input.topic);
    case 'trends':
      return analyzeTrends(input.topic);
    case 'priorities':
      return analyzePriorities(input.topic);
    case 'stale':
      return analyzeStale(input.topic);
    case 'coverage':
      return analyzeCoverage(input.topic);
  }
}

// =============================================================================
// MCP TOOL
// =============================================================================

/** MCP tool response type */
type ResearchAnalyzeToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/**
 * Creates the core handler logic for research_analyze tool.
 */
function createResearchAnalyzeHandler(deps: ResearchAnalyzeDeps) {
  return async (args: unknown, ctx: HandlerContext): Promise<ResearchAnalyzeToolResponse> => {
    const validationResult = ResearchAnalyzeInputSchema.safeParse(args);
    if (!validationResult.success) {
      return {
        isError: true,
        content: [
          { type: 'text', text: `Validation error: ${formatZodError(validationResult.error)}` },
        ],
      };
    }

    ctx.logger.debug('Analyzing research registry', {
      focus: validationResult.data.focus,
    });

    try {
      const result = await executeAnalysis(validationResult.data);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const logger = deps.logger ?? createLogger({ tool: 'research_analyze' });
      logger.error('Research analysis failed', error instanceof Error ? error : new Error(message));
      return {
        isError: true,
        content: [{ type: 'text', text: `Analysis failed: ${message}` }],
      };
    }
  };
}

/**
 * Registers the research_analyze tool with the MCP server.
 *
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerResearchAnalyzeTool(server: McpServer, deps: ResearchAnalyzeDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'research_analyze' });
  const toolSchema = {
    focus: z
      .enum(['gaps', 'trends', 'priorities', 'stale', 'coverage'])
      .describe('Analysis focus area'),
    topic: z.string().optional().describe('Optional topic filter'),
  };

  const description =
    'Analyze the research registry for gaps, trends, priorities, stale entries, or coverage. ' +
    'Returns structured analysis with recommendations.';

  const secureHandler = createSecureHandler(createResearchAnalyzeHandler(deps), {
    toolName: 'research_analyze',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('research_analyze', deps.security);
  const wrappedHandler = wrapToolWithTimeout('research_analyze', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'research_analyze',
    { description, inputSchema: toolSchema },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered research_analyze tool with secure handler and timeout protection');
}
