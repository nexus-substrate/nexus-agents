/**
 * run_research_pipeline MCP Tool (#1711)
 *
 * Exposes the research-to-project pipeline as an MCP tool.
 * Unlike run_dev_pipeline (self-improvement), this pipeline produces
 * external-facing research deliverables and project feasibility studies.
 *
 * @module mcp/tools/research-pipeline-tool
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getErrorMessage } from '../../core/index.js';
import { runResearchPipeline } from '../../pipeline/research-pipeline.js';
import type { ResearchPipelineResult } from '../../pipeline/research-pipeline.js';
import { createResearchStages } from '../../pipeline/research-agent-executor.js';

// ============================================================================
// Input Schema
// ============================================================================

export const ResearchPipelineInputSchema = z.object({
  /** The research prompt — what to investigate. */
  topic: z.string().min(10).max(10000).describe('Research prompt describing what to investigate'),
  /** Whether to run in dry-run mode (research+vote only, no deliverables). */
  dryRun: z
    .boolean()
    .default(false)
    .describe('If true, stop after vote (no deliverable generation)'),
  /** Maximum vote iterations (default: 3). */
  maxVoteIterations: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(3)
    .describe('Max synthesize→vote iterations'),
  /** Maximum parallel research tracks (default: 4). */
  maxParallelTracks: z
    .number()
    .int()
    .min(1)
    .max(8)
    .default(4)
    .describe('Max parallel investigation tracks'),
  /** Session ID for checkpoint/resume. */
  sessionId: z
    .string()
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional()
    .describe('Session ID for checkpoint/resume (crash recovery)'),
  /** Use simulated votes (for testing without real CLIs). */
  simulateVotes: z
    .boolean()
    .default(false)
    .describe('Use simulated votes (for testing without real CLIs)'),
});

export type ResearchPipelineInput = z.infer<typeof ResearchPipelineInputSchema>;

// ============================================================================
// Output Formatting
// ============================================================================

/** Build structured JSON output for consumption. */
function buildStructuredOutput(result: ResearchPipelineResult): Record<string, unknown> {
  return {
    completed: result.completed,
    voteIterations: result.voteIterations,
    trackCount: result.tracks.length,
    tracks: result.tracks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
    })),
    findings: result.findings.map((f) => ({
      trackId: f.trackId,
      confidence: f.confidence,
      summary: f.summary.slice(0, 500),
      gaps: f.gaps,
    })),
    vote: result.vote,
    recommendation: result.synthesis?.recommendation ?? null,
    contradictions: result.synthesis?.contradictions ?? [],
    deliverables: result.deliverables.map((d) => ({
      type: d.type,
      title: d.title,
      contentLength: d.content.length,
      content: d.content,
    })),
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

/** Register the run_research_pipeline MCP tool. */
export function registerResearchPipelineTool(
  server: McpServer,
  _deps: { logger: unknown; rateLimiter: unknown }
): void {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- matches existing tool registration pattern
  server.tool('run_research_pipeline', ResearchPipelineInputSchema.shape, async (args) => {
    const input = ResearchPipelineInputSchema.parse(args);

    try {
      const stages = createResearchStages({
        simulateVotes: input.simulateVotes,
      });

      const result = await runResearchPipeline(input.topic, stages, {
        sessionId: input.sessionId,
        dryRun: input.dryRun,
        maxVoteIterations: input.maxVoteIterations,
        maxParallelTracks: input.maxParallelTracks,
      });

      const structured = buildStructuredOutput(result);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(structured, null, 2) }],
        structuredContent: structured,
      };
    } catch (error: unknown) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Research pipeline error: ${getErrorMessage(error)}`,
          },
        ],
        isError: true,
      };
    }
  });
}
