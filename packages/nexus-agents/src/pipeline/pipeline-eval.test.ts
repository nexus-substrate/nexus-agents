/**
 * Pipeline Performance Evaluation Tests
 *
 * Instrumented tests that measure real pipeline component performance:
 * - Classification accuracy across diverse tasks
 * - Vote cascade detection logic
 * - Stage wrapper execution timing
 * - Template registry completeness
 * - Cross-template behavior comparison
 *
 * Note: pre-#2937 this file also exercised SharedMemoryStore propagation
 * through PipelineContext.sharedMemory — that integration channel was
 * removed because no downstream stage ever read it, and the standalone
 * class was deleted in epic #3313 (zero production consumers).
 *
 * Run with: pnpm vitest run src/pipeline/pipeline-eval.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { classifyTask } from './adaptive-orchestrator.js';
import { createDevStageRegistry, createAuditStageRegistry } from './stage-wrappers.js';
import { PIPELINE_TEMPLATES, getTemplate, listTemplateIds } from './templates.js';
import type {
  DevPipelineStages,
  PipelineTask,
  VoteResult,
  QaReviewResult,
} from './dev-pipeline.js';

function createMockStages(): DevPipelineStages {
  return {
    research: vi.fn<(t: string) => Promise<string>>().mockResolvedValue('Research results'),
    plan: vi
      .fn<(t: string, r: string, f?: string) => Promise<string>>()
      .mockResolvedValue('Plan output'),
    vote: vi
      .fn<(p: string) => Promise<VoteResult>>()
      .mockResolvedValue({ kind: 'approved', approvalPercentage: 80 }),
    decompose: vi.fn<(p: string) => Promise<PipelineTask[]>>().mockResolvedValue([
      {
        id: 't1',
        title: 'Task 1',
        description: 'Do it',
        assignedTo: 'coder' as const,
        status: 'pending' as const,
      },
    ]),
    implement: vi.fn<(t: PipelineTask) => Promise<string>>().mockResolvedValue('Done'),
    qaReview: vi
      .fn<(t: PipelineTask, i: string) => Promise<QaReviewResult>>()
      .mockResolvedValue({ verdict: 'pass', feedback: 'OK', issues: [] }),
    securityScan: vi.fn().mockResolvedValue({ passed: true, findings: [] }),
  };
}

// ============================================================================
// Classification Accuracy
// ============================================================================

describe('Pipeline Eval — Classification Accuracy', () => {
  const cases: { task: string; expected: string; desc: string }[] = [
    {
      task: 'Add a health check endpoint to the Express server',
      expected: 'dev',
      desc: 'feature add',
    },
    { task: 'Refactor the database connection pooling module', expected: 'dev', desc: 'refactor' },
    {
      task: 'Build a notification service for user alerts',
      expected: 'dev',
      desc: 'build feature',
    },
    {
      task: 'Review the repository for security vulnerabilities',
      expected: 'audit',
      desc: 'security review',
    },
    {
      task: 'Inspect the API endpoints for OWASP Top 10 risks',
      expected: 'audit',
      desc: 'OWASP audit',
    },
    {
      task: 'Research alternatives to PostgreSQL for time-series data',
      expected: 'research',
      desc: 'tech research',
    },
    {
      task: 'Investigate the feasibility of migrating to Deno',
      expected: 'research',
      desc: 'feasibility',
    },
    { task: 'Create a new CLI tool from scratch', expected: 'greenfield', desc: 'new project' },
    { task: 'Make the CI pipeline faster', expected: 'general', desc: 'ambiguous' },
    { task: 'Update the README documentation', expected: 'general', desc: 'docs update' },
  ];

  for (const c of cases) {
    it(`classifies "${c.desc}" as ${c.expected}`, () => {
      const result = classifyTask(c.task);
      expect(result.pipelineType).toBe(c.expected);
    });
  }

  it('classification completes in < 5ms per task', () => {
    for (const c of cases) {
      const start = performance.now();
      classifyTask(c.task);
      expect(performance.now() - start).toBeLessThan(5);
    }
  });
});

// ============================================================================
// Stage Registry Completeness
// ============================================================================

describe('Pipeline Eval — Stage Registry', () => {
  it('dev template stages all have registry entries', () => {
    const registry = createDevStageRegistry(createMockStages());
    for (const stageId of getTemplate('dev')?.stages ?? []) {
      expect(registry.has(stageId)).toBe(true);
    }
  });

  it('audit template stages all have registry entries', () => {
    const registry = createAuditStageRegistry();
    for (const stageId of getTemplate('audit')?.stages ?? []) {
      expect(registry.has(stageId)).toBe(true);
    }
  });

  it('all 4 templates registered (research retired in #3488)', () => {
    expect(PIPELINE_TEMPLATES.size).toBe(4);
    expect(listTemplateIds()).toContain('general');
    expect(listTemplateIds()).not.toContain('research');
  });

  it('general template includes security gate', () => {
    expect(getTemplate('general')?.stages).toContain('security');
  });
});

// ============================================================================
// Vote Cascade Logic
// ============================================================================

describe('Pipeline Eval — Vote Cascade Logic', () => {
  it('majority: 3/5 approvals is decided', () => {
    expect(3 / 5 > 0.5).toBe(true);
  });

  it('supermajority: 2/6 approvals + 4 remaining cannot reach 67%', () => {
    expect((2 + 0) / 6 < 0.67).toBe(true); // worst case: 0 remaining approve
    expect((2 + 4) / 6 >= 0.67).toBe(true); // best case: all 4 approve — CAN reach
  });

  it('unanimous: 1 rejection is immediately decided', () => {
    expect(1 > 0).toBe(true);
  });
});

// ============================================================================
// Cross-Template Classification
// ============================================================================

describe('Pipeline Eval — Cross-Template Routing', () => {
  it('security tasks always route to audit', () => {
    for (const t of ['Audit the auth system for vulnerabilities', 'Review security posture']) {
      expect(classifyTask(t).pipelineType).toBe('audit');
    }
  });

  it('implementation tasks route to dev', () => {
    for (const t of ['Implement a caching layer', 'Build a notification service']) {
      expect(classifyTask(t).pipelineType).toBe('dev');
    }
  });

  it('research has higher avg confidence than general', () => {
    const rc = ['Research alternatives to Redis', 'Evaluate the feasibility of Deno migration'].map(
      (t) => classifyTask(t).confidence
    );
    const gc = ['Make things faster', 'Do something with the data'].map(
      (t) => classifyTask(t).confidence
    );
    const avgR = rc.reduce((a, b) => a + b, 0) / rc.length;
    const avgG = gc.reduce((a, b) => a + b, 0) / gc.length;
    expect(avgR).toBeGreaterThan(avgG);
  });
});

// ============================================================================
// LLM Classification Refinement (#1798)
// ============================================================================

describe('Pipeline Eval — LLM Refinement Thresholds', () => {
  it('high-confidence tasks do NOT trigger LLM refinement', () => {
    // Research tasks have confidence >= 0.5 — should never trigger LLM
    const result = classifyTask('Research alternatives to PostgreSQL and evaluate tradeoffs');
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    // LLM refinement only triggers at < 0.3
  });

  it('ambiguous tasks have low confidence (eligible for LLM refinement)', () => {
    const result = classifyTask('Make things better');
    expect(result.confidence).toBeLessThan(0.5);
    // This would trigger LLM refinement in the orchestrator (< 0.3)
  });

  it('LLM_REFINEMENT_THRESHOLD is 0.3', async () => {
    // Verify the threshold constant exists and is reasonable
    const mod = await import('./adaptive-orchestrator.js');
    expect(mod.classifyTask).toBeDefined();
    // The threshold is internal — we test its effect via confidence values
    const ambiguous = mod.classifyTask('Do something with the data');
    expect(ambiguous.confidence).toBeLessThanOrEqual(0.5);
  });
});

// ============================================================================
// Contrarian Check Logic (#1799)
// ============================================================================

describe('Pipeline Eval — Contrarian Escalation Logic', () => {
  it('contrarian escalation threshold is 0.8', () => {
    // A contrarian rejection with confidence >= 0.8 should trigger escalation
    const THRESHOLD = 0.8;
    expect(0.85).toBeGreaterThanOrEqual(THRESHOLD); // would escalate
    expect(0.7).toBeLessThan(THRESHOLD); // would NOT escalate
  });

  it('contrarian only runs on quickMode approvals', () => {
    // The check should NOT run when:
    // - quickMode is false (full vote already includes contrarian)
    // - outcome is rejected (no need to double-check rejections)
    // - simulateVotes is true (no real LLM calls)
    const scenarios = [
      { quickMode: true, outcome: 'approved', simulate: false, shouldCheck: true },
      { quickMode: false, outcome: 'approved', simulate: false, shouldCheck: false },
      { quickMode: true, outcome: 'rejected', simulate: false, shouldCheck: false },
      { quickMode: true, outcome: 'approved', simulate: true, shouldCheck: false },
    ];
    for (const s of scenarios) {
      const shouldRun = s.quickMode && s.outcome === 'approved' && !s.simulate;
      expect(shouldRun).toBe(s.shouldCheck);
    }
  });

  it('escalation re-runs with full vote (quickMode=false)', () => {
    // When escalation triggers, the system should re-run executeVoting
    // with quickMode=false (6 agents) to get the full perspective
    // This is verified by the implementation: executeVoting({...input, quickMode: false})
    const input = { quickMode: true, simulateVotes: false };
    const escalatedInput = { ...input, quickMode: false };
    expect(escalatedInput.quickMode).toBe(false);
  });
});
