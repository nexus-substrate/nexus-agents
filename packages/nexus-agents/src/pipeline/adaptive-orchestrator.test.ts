/**
 * Tests for Adaptive Orchestrator (#1736, Phase 3)
 */

import { describe, it, expect, vi } from 'vitest';
import { classifyTask, runAdaptiveOrchestrator } from './adaptive-orchestrator.js';
import type { DevPipelineStages, VoteResult, QaReviewResult } from './dev-pipeline.js';
import { createDevStageRegistry } from './stage-wrappers.js';

// Mock observability + outcome store
vi.mock('./pipeline-observability.js', () => ({
  emitPipelineStageEvent: vi.fn(),
}));

vi.mock('../orchestration/outcomes/outcome-store.js', () => ({
  getOutcomeStore: vi.fn().mockReturnValue({
    append: vi.fn(),
    query: vi.fn().mockReturnValue([]),
  }),
}));

// ============================================================================
// Helpers
// ============================================================================

function createMockStages(): DevPipelineStages {
  return {
    research: vi.fn<(task: string) => Promise<string>>().mockResolvedValue('Research'),
    plan: vi
      .fn<(task: string, research: string, feedback?: string) => Promise<string>>()
      .mockResolvedValue('Plan'),
    vote: vi
      .fn<(plan: string) => Promise<VoteResult>>()
      .mockResolvedValue({ kind: 'approved', approvalPercentage: 83 }),
    decompose: vi
      .fn()
      .mockResolvedValue([
        { id: 't1', title: 'T1', description: 'D', assignedTo: 'coder', status: 'pending' },
      ]),
    implement: vi.fn<() => Promise<string>>().mockResolvedValue('Done'),
    qaReview: vi
      .fn<() => Promise<QaReviewResult>>()
      .mockResolvedValue({ verdict: 'pass', feedback: '', issues: [] }),
    securityScan: vi.fn().mockResolvedValue({ passed: true, feedback: '' }),
  };
}

// ============================================================================
// Task Classification Tests
// ============================================================================

describe('classifyTask', () => {
  it('classifies implementation tasks as dev', () => {
    const result = classifyTask('Implement a new login feature with tests');
    expect(result.pipelineType).toBe('dev');
    expect(result.keywords).toContain('implement');
  });

  it('classifies research tasks as research', () => {
    const result = classifyTask('Research alternatives to Ventoy and evaluate feasibility');
    expect(result.pipelineType).toBe('research');
    expect(result.keywords).toContain('research');
  });

  it('classifies security tasks as audit', () => {
    const result = classifyTask('Perform a security audit for OWASP vulnerabilities');
    expect(result.pipelineType).toBe('audit');
    expect(result.keywords).toContain('security');
    expect(result.keywords).toContain('audit');
  });

  it('classifies review tasks as audit', () => {
    const result = classifyTask('Review this repo for security issues');
    expect(result.pipelineType).toBe('audit');
    expect(result.keywords).toContain('review');
  });

  it('classifies inspection tasks as audit', () => {
    const result = classifyTask('Inspect the codebase and check for vulnerabilities');
    expect(result.pipelineType).toBe('audit');
  });

  it('defaults to general for ambiguous tasks (fail-safe with security gate)', () => {
    const result = classifyTask('Do something');
    expect(result.pipelineType).toBe('general');
  });

  it('classifies greenfield tasks', () => {
    const result = classifyTask('Create a new project from scratch with scaffold');
    expect(result.pipelineType).toBe('greenfield');
    expect(result.keywords).toContain('new project');
  });

  it('detects greenfield from spec file language', () => {
    const result = classifyTask('Bootstrap a greenfield repo and initialize project structure');
    expect(result.pipelineType).toBe('greenfield');
  });

  it('detects complex tasks', () => {
    const result = classifyTask('Comprehensive system-wide architecture refactor');
    expect(result.complexity).toBe('complex');
  });

  it('detects simple tasks', () => {
    const result = classifyTask('Quick fix for a simple typo');
    expect(result.complexity).toBe('simple');
  });

  it('defaults to moderate complexity', () => {
    const result = classifyTask('Add error handling to the API');
    expect(result.complexity).toBe('moderate');
  });

  it('provides confidence score', () => {
    const highConf = classifyTask('Research and evaluate alternatives');
    const lowConf = classifyTask('Do something');
    expect(highConf.confidence).toBeGreaterThan(lowConf.confidence);
  });
});

// ============================================================================
// Orchestrator Tests
// ============================================================================

describe('runAdaptiveOrchestrator', () => {
  it('auto-detects template and executes', async () => {
    const stages = createDevStageRegistry(createMockStages());

    const result = await runAdaptiveOrchestrator('Implement feature X', {
      stages,
    });

    expect(result.success).toBe(true);
    expect(result.templateId).toBe('dev');
    expect(result.selectionMethod).toBe('auto-detected');
    expect(result.taskClassification.pipelineType).toBe('dev');
  });

  it('uses explicit template when provided', async () => {
    const stages = createDevStageRegistry(createMockStages());

    const result = await runAdaptiveOrchestrator('Implement feature X', {
      stages,
      templateId: 'dev',
    });

    expect(result.selectionMethod).toBe('explicit');
    expect(result.templateId).toBe('dev');
  });

  it('supports dryRun mode', async () => {
    const mockStages = createMockStages();
    const stages = createDevStageRegistry(mockStages);

    const result = await runAdaptiveOrchestrator('Build feature', {
      stages,
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(mockStages.securityScan).not.toHaveBeenCalled();
  });

  it('falls back to dev template for unknown templateId', async () => {
    const stages = createDevStageRegistry(createMockStages());

    const result = await runAdaptiveOrchestrator('Task', {
      stages,
      templateId: 'nonexistent-template',
    });

    expect(result.templateId).toBe('dev');
    expect(result.success).toBe(true);
  });
});
