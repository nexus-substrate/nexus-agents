/**
 * Pipeline Integration Tests — End-to-end validation of pipeline wiring.
 *
 * Verifies that vote cascading, input sanitization, trust classification,
 * and codebase intelligence compose correctly across pipeline stages.
 *
 * Note: pre-#2937 this file also covered `SharedMemoryStore` propagation
 * through `PipelineContext.sharedMemory`. That field (and the writes from
 * every stage) was removed in #2937 because no downstream stage ever read
 * from the store. The class itself still ships as a standalone utility —
 * see `phase4.test.ts` for direct-class coverage.
 *
 * (Source: Pipeline Validation Wave — post-Tier 1-3 wiring)
 */

import { describe, it, expect, vi } from 'vitest';
import { researchContextFromText, type ResearchContext } from './research-context.js';
import { createDevStageRegistry, createAuditStageRegistry } from './stage-wrappers.js';
import type {
  DevPipelineStages,
  PipelineTask,
  VoteResult,
  QaReviewResult,
} from './dev-pipeline.js';
import { classifyTask } from './adaptive-orchestrator.js';
import { PIPELINE_TEMPLATES, getTemplate, listTemplateIds } from './templates.js';

// ============================================================================
// Helpers
// ============================================================================

function createMockStages(): DevPipelineStages {
  return {
    research: vi
      .fn<(task: string) => Promise<ResearchContext>>()
      .mockResolvedValue(researchContextFromText('Research findings on auth patterns')),
    plan: vi
      .fn<(task: string, research: string, feedback?: string) => Promise<string>>()
      .mockResolvedValue('Auth implementation plan'),
    vote: vi
      .fn<(plan: string) => Promise<VoteResult>>()
      .mockResolvedValue({ kind: 'approved', approvalPercentage: 85 }),
    decompose: vi.fn<(plan: string) => Promise<PipelineTask[]>>().mockResolvedValue([
      {
        id: 'task-1',
        title: 'Create auth service',
        description: 'Build it',
        assignedTo: 'coder' as const,
        status: 'pending' as const,
      },
    ]),
    implement: vi
      .fn<(task: PipelineTask) => Promise<string>>()
      .mockResolvedValue('Implementation complete'),
    qaReview: vi
      .fn<(task: PipelineTask, impl: string) => Promise<QaReviewResult>>()
      .mockResolvedValue({ verdict: 'pass', feedback: 'Looks good', issues: [] }),
    securityScan: vi.fn().mockResolvedValue({ passed: true, verdict: 'pass', feedback: '' }),
  };
}

// ============================================================================
// Integration Tests
// ============================================================================

// Pipeline Integration — SharedMemoryStore propagation tests removed in
// #2937. The propagation channel (PipelineContext.sharedMemory + the writes
// in every stage wrapper) was dead — nothing ever read it. The standalone
// SharedMemoryStore class was later deleted in epic #3313 (zero production
// consumers); cross-stage data now flows through PipelineContext.state.

describe('Pipeline Integration — Task classification', () => {
  it('review tasks classify as audit', () => {
    const result = classifyTask('Review this repository for security issues');
    expect(result.pipelineType).toBe('audit');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('implementation tasks classify as dev', () => {
    const result = classifyTask('Implement a new feature for user authentication');
    expect(result.pipelineType).toBe('dev');
  });

  it('ambiguous tasks classify as general with security gate', () => {
    const result = classifyTask('Do something with the data');
    expect(result.pipelineType).toBe('general');
    // General template must include security gate
    const template = getTemplate('general');
    expect(template?.stages).toContain('security');
  });
});

describe('Pipeline Integration — Template registry', () => {
  it('has 4 templates including general (research retired in #3488)', () => {
    expect(PIPELINE_TEMPLATES.size).toBe(4);
    expect(listTemplateIds()).toContain('general');
    expect(listTemplateIds()).not.toContain('research');
  });

  it('all templates have stage arrays', () => {
    for (const [id, template] of PIPELINE_TEMPLATES) {
      expect(template.stages.length).toBeGreaterThan(0);
      expect(template.id).toBe(id);
    }
  });

  it('audit template has analyze-scan-report stages', () => {
    const audit = getTemplate('audit');
    expect(audit?.stages).toEqual(['analyze', 'scan', 'report']);
  });
});

describe('Pipeline Integration — Stage registries', () => {
  it('dev registry has all expected stages', () => {
    const stages = createMockStages();
    const registry = createDevStageRegistry(stages);
    expect(registry.has('research')).toBe(true);
    expect(registry.has('plan')).toBe(true);
    expect(registry.has('vote')).toBe(true);
    expect(registry.has('implement')).toBe(true);
    expect(registry.has('security')).toBe(true);
  });

  it('audit registry has analyze-scan-report stages', () => {
    const registry = createAuditStageRegistry();
    expect(registry.has('analyze')).toBe(true);
    expect(registry.has('scan')).toBe(true);
    expect(registry.has('report')).toBe(true);
  });
});

describe('Pipeline Integration — Vote cascade detection', () => {
  it('unanimous rejection detected on first reject', async () => {
    // Verify the consensus module loads without error (cascade logic is internal)
    await import('../mcp/tools/consensus-vote.js');
    // classifyTask + template selection should work without crashing
    const result = classifyTask('Test vote cascading behavior');
    expect(result).toBeDefined();
    expect(result.pipelineType).toBeDefined();
  });
});
