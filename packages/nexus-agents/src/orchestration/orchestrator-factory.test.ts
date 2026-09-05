/**
 * Tests for OrchestratorFactory and WorkflowOrchestratorAdapter.
 *
 * Covers: OrchestratorFactory.create, listTypes, WorkflowOrchestratorAdapter
 * execute, getStatus, cancel, getHistory
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ok, err } from '../core/index.js';
import { OrchestratorError } from '../core/types/orchestrator.js';
import type { OrchestratorDefinition } from '../core/types/orchestrator.js';
import type { IWorkflowEngine, WorkflowResult, WorkflowDefinition } from '../core/index.js';

import { OrchestratorFactory, WorkflowOrchestratorAdapter } from './orchestrator-factory.js';

// ============================================================================
// Mock helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn(),
    getLevel: vi.fn(),
    setFormat: vi.fn(),
    setDestination: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

function makeMockWorkflowEngine(overrides: Partial<IWorkflowEngine> = {}): IWorkflowEngine {
  return {
    loadTemplate: vi.fn().mockResolvedValue(
      ok({
        name: 'test-workflow',
        steps: [{ id: 'step-1', type: 'prompt', prompt: 'test' }],
        version: '1.0',
      } as unknown as WorkflowDefinition)
    ),
    execute: vi.fn().mockResolvedValue(
      ok({
        success: true,
        output: 'workflow result',
        stepResults: [
          { stepId: 'step-1', status: 'success', output: 'step output', durationMs: 100 },
        ],
        durationMs: 100,
      } as unknown as WorkflowResult)
    ),
    cancel: vi.fn().mockResolvedValue(ok(undefined)),
    getStatus: vi.fn().mockReturnValue({ state: 'pending' }),
    listTemplates: vi.fn().mockResolvedValue(ok([])),
    ...overrides,
  } as unknown as IWorkflowEngine;
}

// ============================================================================
// OrchestratorFactory
// ============================================================================

describe('OrchestratorFactory', () => {
  let factory: OrchestratorFactory;
  let mockEngine: IWorkflowEngine;
  const mockLogger = makeMockLogger();

  beforeEach(() => {
    mockEngine = makeMockWorkflowEngine();
    factory = new OrchestratorFactory({ logger: mockLogger }, mockEngine);
  });

  describe('listTypes', () => {
    it('returns all canonical orchestrator types', () => {
      const types = factory.listTypes();
      expect(types).toContain('workflow');
      expect(types).toContain('orchestrator');
      expect(types).toContain('puppeteer');
      expect(types).toHaveLength(3);
    });
  });

  describe('create', () => {
    it('creates a workflow orchestrator', () => {
      const orchestrator = factory.create('workflow');
      expect(orchestrator).toBeDefined();
      expect(orchestrator.type).toBe('workflow');
    });

    it('creates a tech_lead orchestrator', () => {
      const orchestrator = factory.create('orchestrator');
      expect(orchestrator).toBeDefined();
      expect(orchestrator.type).toBe('orchestrator');
    });

    it('creates a puppeteer orchestrator', () => {
      const orchestrator = factory.create('puppeteer');
      expect(orchestrator).toBeDefined();
      expect(orchestrator.type).toBe('puppeteer');
    });

    it('throws for custom orchestrator type', () => {
      expect(() => factory.create('custom')).toThrow(OrchestratorError);
    });

    it('throws when workflow engine not initialized', () => {
      const factoryNoEngine = new OrchestratorFactory({ logger: mockLogger });
      expect(() => factoryNoEngine.create('workflow')).toThrow(OrchestratorError);
    });

    it('wires TechLead instance when provided', () => {
      const mockTechLead = { execute: vi.fn() };
      const factoryWithTL = new OrchestratorFactory(
        { logger: mockLogger, techLead: mockTechLead },
        mockEngine
      );
      const orchestrator = factoryWithTL.create('orchestrator');
      expect(orchestrator).toBeDefined();
    });

    it('returns the CLI executed by the wired orchestrator agent (#5513)', async () => {
      const mockTechLead = {
        execute: vi.fn().mockResolvedValue(
          ok({
            output: {},
            metadata: { executedCli: 'codex', executedCliSource: 'executed' },
          })
        ),
      };
      const factoryWithTL = new OrchestratorFactory(
        { logger: mockLogger, techLead: mockTechLead },
        mockEngine
      );

      const result = await factoryWithTL.create('orchestrator').execute(
        {
          type: 'task',
          task: { id: 'task-1', description: 'Implement feature', context: {} },
        },
        {}
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toMatchObject({
        executedCli: 'codex',
        executedCliSource: 'executed',
      });
    });

    it('wires PuppeteerOrchestrator instance when provided', () => {
      const mockPuppeteer = { execute: vi.fn() };
      const factoryWithPP = new OrchestratorFactory(
        { logger: mockLogger, puppeteerOrchestrator: mockPuppeteer },
        mockEngine
      );
      const orchestrator = factoryWithPP.create('puppeteer');
      expect(orchestrator).toBeDefined();
    });

    it('does not trust CLI metadata embedded in puppeteer output (#5513)', async () => {
      const mockPuppeteer = {
        execute: vi
          .fn()
          .mockResolvedValue(
            ok({ metadata: { executedCli: 'codex', executedCliSource: 'executed' } })
          ),
      };
      const factoryWithPP = new OrchestratorFactory(
        { logger: mockLogger, puppeteerOrchestrator: mockPuppeteer },
        mockEngine
      );

      const result = await factoryWithPP
        .create('puppeteer')
        .execute({ type: 'policy', policyId: 'policy-1', initialState: {} }, {});

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.executedCli).toBeUndefined();
      expect(result.value.executedCliSource).toBe('unknown');
    });
  });
});

// ============================================================================
// WorkflowOrchestratorAdapter
// ============================================================================

describe('WorkflowOrchestratorAdapter', () => {
  let adapter: WorkflowOrchestratorAdapter;
  let mockEngine: IWorkflowEngine;
  const mockLogger = makeMockLogger();

  beforeEach(() => {
    mockEngine = makeMockWorkflowEngine();
    adapter = new WorkflowOrchestratorAdapter(mockEngine, mockLogger);
  });

  it('has workflow type', () => {
    expect(adapter.type).toBe('workflow');
  });

  it('has a unique id', () => {
    const adapter2 = new WorkflowOrchestratorAdapter(mockEngine, mockLogger);
    expect(adapter.id).not.toBe(adapter2.id);
    expect(adapter.id).toMatch(/^workflow-/);
  });

  describe('execute', () => {
    const workflowDef: OrchestratorDefinition = {
      type: 'workflow',
      templatePath: './templates/test.yaml',
    };

    it('executes a workflow definition successfully', async () => {
      const result = await adapter.execute(workflowDef, { input: 'test' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.orchestratorType).toBe('workflow');
        expect(result.value.steps).toHaveLength(1);
        expect(result.value.output).toBe('workflow result');
      }
    });

    it('rejects non-workflow definitions', async () => {
      const nonWorkflow = {
        type: 'orchestrator',
        task: 'test',
      } as unknown as OrchestratorDefinition;
      const result = await adapter.execute(nonWorkflow, {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(OrchestratorError);
        expect(result.error.code).toBe('INVALID_DEFINITION');
      }
    });

    it('returns error when template loading fails', async () => {
      mockEngine = makeMockWorkflowEngine({
        loadTemplate: vi.fn().mockResolvedValue(err(new Error('Template not found'))),
      });
      adapter = new WorkflowOrchestratorAdapter(mockEngine, mockLogger);
      const result = await adapter.execute(workflowDef, {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_DEFINITION');
      }
    });

    it('returns error when execution fails', async () => {
      mockEngine = makeMockWorkflowEngine({
        execute: vi.fn().mockResolvedValue(err(new Error('Execution failed'))),
      });
      adapter = new WorkflowOrchestratorAdapter(mockEngine, mockLogger);
      const result = await adapter.execute(workflowDef, {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STEP_FAILED');
      }
    });

    it('handles unexpected errors gracefully', async () => {
      mockEngine = makeMockWorkflowEngine({
        loadTemplate: vi.fn().mockRejectedValue(new Error('Network error')),
      });
      adapter = new WorkflowOrchestratorAdapter(mockEngine, mockLogger);
      const result = await adapter.execute(workflowDef, {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STEP_FAILED');
        expect(result.error.message).toContain('Network error');
      }
    });
  });

  describe('getStatus', () => {
    it('returns pending for unknown execution', () => {
      const status = adapter.getStatus('nonexistent');
      expect(status.state).toBe('pending');
    });

    it('returns completed after successful execution', async () => {
      const def: OrchestratorDefinition = {
        type: 'workflow',
        templatePath: './test.yaml',
      };
      const result = await adapter.execute(def, {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        const status = adapter.getStatus(result.value.executionId);
        expect(status.state).toBe('completed');
      }
    });
  });

  describe('cancel', () => {
    it('returns error for unknown execution', async () => {
      const result = await adapter.cancel('nonexistent');
      expect(result.ok).toBe(false);
    });

    it('returns error for non-running execution', async () => {
      // Execute to completion first
      const def: OrchestratorDefinition = {
        type: 'workflow',
        templatePath: './test.yaml',
      };
      const execResult = await adapter.execute(def, {});
      expect(execResult.ok).toBe(true);
      if (execResult.ok) {
        const cancelResult = await adapter.cancel(execResult.value.executionId);
        expect(cancelResult.ok).toBe(false);
      }
    });
  });

  describe('getHistory', () => {
    it('returns empty history initially', () => {
      expect(adapter.getHistory()).toHaveLength(0);
    });

    it('returns execution results', async () => {
      const def: OrchestratorDefinition = {
        type: 'workflow',
        templatePath: './test.yaml',
      };
      await adapter.execute(def, {});
      const history = adapter.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]?.orchestratorType).toBe('workflow');
    });

    it('respects limit parameter', async () => {
      const def: OrchestratorDefinition = {
        type: 'workflow',
        templatePath: './test.yaml',
      };
      await adapter.execute(def, { run: 1 });
      await adapter.execute(def, { run: 2 });
      await adapter.execute(def, { run: 3 });

      expect(adapter.getHistory(2)).toHaveLength(2);
      expect(adapter.getHistory(1)).toHaveLength(1);
    });

    it('caps history at 100 entries', async () => {
      const def: OrchestratorDefinition = {
        type: 'workflow',
        templatePath: './test.yaml',
      };
      // Execute 105 times
      for (let i = 0; i < 105; i++) {
        await adapter.execute(def, { run: i });
      }
      expect(adapter.getHistory(200)).toHaveLength(100);
    });
  });
});
