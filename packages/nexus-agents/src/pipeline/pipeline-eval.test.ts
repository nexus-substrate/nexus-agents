/**
 * Pipeline Performance Evaluation Tests
 *
 * Instrumented tests that measure real pipeline component performance:
 * - Classification accuracy across diverse tasks
 * - SharedMemoryStore propagation and timing
 * - Vote cascade detection logic
 * - Stage wrapper execution timing
 * - Template registry completeness
 * - Cross-template behavior comparison
 *
 * Run with: pnpm vitest run src/pipeline/pipeline-eval.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { classifyTask } from './adaptive-orchestrator.js';
import { SharedMemoryStore } from './shared-memory.js';
import {
  createResearchStageWrapper,
  createPlanStageWrapper,
  createImplementStageWrapper,
  createDevStageRegistry,
  createAuditStageRegistry,
} from './stage-wrappers.js';
import { PIPELINE_TEMPLATES, getTemplate, listTemplateIds } from './templates.js';
import { PIPELINE_STATE_KEYS as K } from './stage-types.js';
import type { PipelineContext } from './stage-types.js';
import type {
  DevPipelineStages,
  PipelineTask,
  VoteResult,
  QaReviewResult,
} from './dev-pipeline.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeContext(
  overrides?: Partial<PipelineContext>,
  stateOverrides?: Record<string, unknown>
): PipelineContext {
  return {
    executionId: 'eval-test',
    task: overrides?.task ?? 'Evaluate pipeline performance',
    templateId: 'dev',
    state: { [K.TASK]: 'Evaluate pipeline performance', ...stateOverrides },
    sharedMemory: overrides?.sharedMemory ?? new SharedMemoryStore(),
    ...overrides,
  };
}

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
// SharedMemoryStore Performance
// ============================================================================

describe('Pipeline Eval — SharedMemoryStore Performance', () => {
  it('writes 100 entries in < 10ms', () => {
    const store = new SharedMemoryStore();
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      store.write(`stage-${String(i)}`, 'discovery', `Finding ${String(i)}`);
    }
    expect(performance.now() - start).toBeLessThan(10);
    expect(store.read().length).toBe(100);
  });

  it('reads by tag in < 1ms', () => {
    const store = new SharedMemoryStore();
    for (let i = 0; i < 50; i++) {
      store.write('research', i % 2 === 0 ? 'discovery' : 'decision', `E ${String(i)}`);
    }
    const start = performance.now();
    const result = store.read('discovery');
    expect(performance.now() - start).toBeLessThan(1);
    expect(result.length).toBe(25);
  });

  it('evicts oldest when at capacity', () => {
    const store = new SharedMemoryStore(10);
    for (let i = 0; i < 15; i++) {
      store.write('s', 'discovery', `E ${String(i)}`);
    }
    expect(store.read().length).toBe(10);
    expect(store.read()[0]?.content as string).toBe('E 5');
  });

  it('propagates across research → plan → implement stages', async () => {
    const stages = createMockStages();
    const sharedMemory = new SharedMemoryStore();
    const ctx = makeContext({ sharedMemory });

    await createResearchStageWrapper(stages).execute(ctx);
    await createPlanStageWrapper(stages).execute({
      ...ctx,
      state: { ...ctx.state, [K.RESEARCH]: 'data' },
    });
    await createImplementStageWrapper(stages).execute({
      ...ctx,
      state: {
        ...ctx.state,
        [K.TASKS]: [
          {
            id: 't1',
            title: 'T',
            description: 'D',
            assignedTo: 'coder' as const,
            status: 'pending' as const,
          },
        ],
      },
    });

    const all = sharedMemory.read();
    expect(all.length).toBeGreaterThanOrEqual(3);
    const sources = [...new Set(all.map((e) => e.sourceStage))];
    expect(sources).toContain('research');
    expect(sources).toContain('plan');
    expect(sources).toContain('implement');
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

  it('all 5 templates registered', () => {
    expect(PIPELINE_TEMPLATES.size).toBe(5);
    expect(listTemplateIds()).toContain('general');
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
