/**
 * Central Workflow Hub Integration Test (#1711)
 *
 * Validates the dev pipeline processes the hub integration vision:
 * - Plan iteration with vote feedback
 * - QA iteration with implementation feedback
 * - All tasks decomposed and completed
 */

import { describe, it, expect } from 'vitest';
import { researchContextFromText } from './research-context.js';
import { runDevPipeline } from './dev-pipeline.js';
import type { DevPipelineStages, VoteResult } from './dev-pipeline.js';

const VISION_TASK = `# Central Workflow Hub Vision
Wire all nexus-agents tools into the dev pipeline:
1. research_discover feeds into research stage
2. weather_report informs plan stage
3. outcome store provides historical context
4. research triggers auto-create pipeline tasks`;

function createVisionStages(): { stages: DevPipelineStages } {
  const state = { voteCount: 0 };

  const stages: DevPipelineStages = {
    research: () =>
      Promise.resolve(
        researchContextFromText(
          '## Research: existing tools (research_discover, weather_report, outcome store) are standalone islands'
        )
      ),

    plan: (_task, _research, feedback) =>
      Promise.resolve(
        feedback !== undefined
          ? `## Revised Plan\nPhase 1: MVP integration\nPhase 2: Outcome feedback\nAddressing: ${feedback.slice(0, 100)}`
          : '## Plan: Central Workflow Hub\nPhase 1: Wire tools\nPhase 2: Feedback loop'
      ),

    vote: (): Promise<VoteResult> => {
      state.voteCount++;
      if (state.voteCount === 1) {
        return Promise.resolve({
          kind: 'rejected',
          feedback: 'Needs MVP scope and recursion prevention',
          approvalPercentage: 40,
        });
      }
      return Promise.resolve({ kind: 'approved', approvalPercentage: 83 });
    },

    decompose: () =>
      Promise.resolve([
        {
          id: 'hub-1',
          title: 'Wire research_discover',
          description: 'Research stage integration',
          assignedTo: 'coder' as const,
          status: 'pending' as const,
        },
        {
          id: 'hub-2',
          title: 'Add weather_report to plan',
          description: 'Plan stage enrichment',
          assignedTo: 'coder' as const,
          status: 'pending' as const,
        },
        {
          id: 'hub-3',
          title: 'Query outcome store',
          description: 'Historical context',
          assignedTo: 'coder' as const,
          status: 'pending' as const,
        },
        {
          id: 'hub-4',
          title: 'Research trigger',
          description: 'Auto-discovery pipeline',
          assignedTo: 'coder' as const,
          status: 'pending' as const,
        },
      ]),

    implement: (task) => Promise.resolve(`// Implementation for ${task.id}: ${task.title}`),

    qaReview: (task) => {
      if (task.id === 'hub-4' && task.feedback === undefined) {
        return Promise.resolve({
          verdict: 'needs_work' as const,
          feedback: 'Needs rate limiting and dedup',
          issues: ['No rate limiting', 'No dedup'],
        });
      }
      return Promise.resolve({ verdict: 'pass' as const, feedback: 'OK', issues: [] });
    },

    securityScan: () => Promise.resolve({ passed: true, feedback: 'MCP calls sanitized' }),
  };

  return { stages };
}

describe('Central Workflow Hub E2E (#1711)', () => {
  it('completes pipeline with vote iteration and QA iteration', async () => {
    const { stages } = createVisionStages();
    const result = await runDevPipeline(VISION_TASK, stages);

    expect(result.completed).toBe(true);
    expect(result.voteIterations).toBe(2);
    expect(result.tasks).toHaveLength(4);
    expect(result.qaIterations).toBe(5);
    expect(result.tasks.every((t) => t.implementation !== undefined)).toBe(true);
  });

  it('plan includes feedback from rejected vote', async () => {
    const { stages } = createVisionStages();
    const result = await runDevPipeline(VISION_TASK, stages);

    expect(result.plan).toContain('Revised Plan');
    expect(result.plan).toContain('MVP scope');
  });

  it('hub-4 goes through QA iteration for rate limiting', async () => {
    const { stages } = createVisionStages();
    const result = await runDevPipeline(VISION_TASK, stages);

    const hub4 = result.tasks.find((t) => t.id === 'hub-4');
    expect(hub4).toBeDefined();
    expect(hub4?.status).toBe('done');
  });
});
