/**
 * REFINE Phase Tests - executeRefine
 *
 * Tests for the executeRefine function with reflexion protocol.
 *
 * @module workflows/self-development/phases/refine-execute.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeRefine, RefineUnavailableError } from './refine.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';
import type { SelfDevWorkflowState, PlanOutput, ImplementationPlan } from '../types.js';
import { SELF_DEV_PERSONAS } from '../types.js';
import type {
  TrinityResult,
  WorkerOutput,
  VerifierOutput,
  ThinkerOutput,
} from '../../../agents/collaboration/trinity-types.js';

/**
 * Mutable version of SelfDevWorkflowDependencies for test setup.
 */
type MutableDeps = {
  -readonly [K in keyof SelfDevWorkflowDependencies]: SelfDevWorkflowDependencies[K];
};

function createMockPlan(): PlanOutput {
  const plan: ImplementationPlan = {
    problemAnalysis: 'Test problem analysis',
    successCriteria: ['Test passes', 'Coverage > 80%'],
    files: [{ path: 'src/test.ts', action: 'create', description: 'Test file' }],
    interfaces: ['ITestInterface'],
    dependencies: [],
    testPlan: 'Unit and integration tests',
  };
  const thinkerOutput: ThinkerOutput = {
    problemAnalysis: 'Thinking',
    approach: 'Approach description',
    considerations: ['consideration 1'],
    successCriteria: ['criterion 1'],
  };

  const workerOutput: WorkerOutput = {
    implementation: 'Worker',
    stepsCompleted: ['step 1'],
    deviations: [],
    questions: [],
  };

  const verifierOutput: VerifierOutput = {
    verdict: 'pass',
    correctnessCheck: 'Correct',
    qualityCheck: 'Good quality',
    issuesFound: [],
    recommendations: [],
  };

  const trinityResult: TrinityResult = {
    success: true,
    thinkerOutput,
    workerOutput,
    verifierOutput,
    finalOutput: 'Final implementation plan output',
    iterations: 1,
    totalDurationMs: 1000,
    history: [],
    stopReason: 'verified',
  };
  return { trinityResult, plan, iterations: 1, verified: true, durationMs: 1000 };
}

function createMockReflexion(overrides = {}): { execute: ReturnType<typeof vi.fn> } {
  return {
    execute: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        success: true,
        expertResults: [
          { expertId: 'architect', contributionScore: 0.8, result: { output: 'Good' } },
          { expertId: 'security', contributionScore: 0.9, result: { output: 'Secure' } },
        ],
        aggregatedResult: { output: 'Aggregated final output' },
        ...overrides,
      },
    }),
  };
}

describe('refine phase - executeRefine', () => {
  let deps: MutableDeps;
  let state: SelfDevWorkflowState;

  beforeEach(() => {
    deps = {
      modelAdapter: {
        complete: vi.fn().mockResolvedValue({
          ok: true,
          value: { content: [{ type: 'text', text: 'Response' }], usage: { totalTokens: 100 } },
        }),
      } as never,
    };
    state = {
      executionId: 'test-exec-123',
      currentPhase: 'refine',
      config: {
        repository: 'owner/repo',
        targetIssue: 1,
        phases: { refine: { maxIterations: 3 } },
      },
      checkpoints: [],
      startedAt: new Date().toISOString(),
      status: 'running',
    } as unknown as SelfDevWorkflowState;
  });

  describe('with reflexion protocol', () => {
    it('executes reflexion protocol successfully', async () => {
      const mockReflexion = createMockReflexion();
      deps.reflexion = mockReflexion as never;

      const result = await executeRefine(deps, state, createMockPlan());

      expect(mockReflexion.execute).toHaveBeenCalled();
      expect(result.converged).toBe(true);
      expect(result.reflexionResult.finalOutput).toBe('Aggregated final output');
    });

    it('builds critiques with severity based on contribution score', async () => {
      const mockReflexion = {
        execute: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            success: true,
            expertResults: [
              { expertId: 'architect', contributionScore: 0.5, result: { output: 'issue' } },
              { expertId: 'security', contributionScore: 0.8, result: { output: 'suggest' } },
            ],
            aggregatedResult: { output: 'Final' },
          },
        }),
      };
      deps.reflexion = mockReflexion as never;

      const result = await executeRefine(deps, state, createMockPlan());

      expect(result.critiques).toHaveLength(2);
      expect(result.critiques[0]!.severity).toBe(0.5); // Low contribution -> high severity
      expect(result.critiques[1]!.severity).toBe(0.1); // High contribution -> low severity
      expect(result.finalSeverity).toBe(0.3); // (0.5 + 0.1) / 2
    });

    it('throws RefineUnavailableError when reflexion fails and fallback disabled', async () => {
      deps.reflexion = {
        execute: vi.fn().mockResolvedValue({ ok: false, error: { message: 'Failed' } }),
      } as never;

      await expect(executeRefine(deps, state, createMockPlan())).rejects.toThrow(
        RefineUnavailableError
      );
      await expect(executeRefine(deps, state, createMockPlan())).rejects.toThrow(
        'ReflexionProtocol execution failed'
      );
    });

    it('falls back when reflexion fails and heuristic fallback enabled', async () => {
      deps.reflexion = {
        execute: vi.fn().mockResolvedValue({ ok: false, error: { message: 'Failed' } }),
      } as never;
      const stateWithFallback = {
        ...state,
        config: { ...state.config, phases: { refine: { allowHeuristicFallback: true } } },
      } as SelfDevWorkflowState;

      const result = await executeRefine(deps, stateWithFallback, createMockPlan());

      expect(result.converged).toBe(true);
      expect(result.iterations).toBe(1);
      expect(result.critiques).toHaveLength(SELF_DEV_PERSONAS.length);
    });

    it('sets termination reason based on success flag', async () => {
      deps.reflexion = {
        execute: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            success: false,
            expertResults: [{ expertId: 'a', contributionScore: 0.5, result: { output: '' } }],
            aggregatedResult: { output: 'Final' },
          },
        }),
      } as never;

      const result = await executeRefine(deps, state, createMockPlan());

      expect(result.reflexionResult.terminationReason).toBe('max_iterations');
      expect(result.converged).toBe(false);
    });

    it('passes correct config to reflexion protocol', async () => {
      const mockReflexion = createMockReflexion();
      deps.reflexion = mockReflexion as never;

      await executeRefine(deps, state, createMockPlan());

      const callArgs = mockReflexion.execute.mock.calls[0]![0] as {
        pattern: string;
        maxRetries: number;
        experts: string[];
      };
      expect(callArgs.pattern).toBe('reflexion');
      expect(callArgs.maxRetries).toBe(3);
      expect(callArgs.experts).toEqual(SELF_DEV_PERSONAS.map((p) => p.id));
    });

    it('creates agents from all personas', async () => {
      const mockReflexion = createMockReflexion();
      deps.reflexion = mockReflexion as never;

      await executeRefine(deps, state, createMockPlan());

      const agentsMap = mockReflexion.execute.mock.calls[0]![1] as Map<string, unknown>;
      expect(agentsMap.size).toBe(SELF_DEV_PERSONAS.length);
      for (const persona of SELF_DEV_PERSONAS) {
        expect(agentsMap.has(persona.id)).toBe(true);
      }
    });
  });

  describe('without reflexion protocol', () => {
    it('throws RefineUnavailableError when reflexion undefined and fallback disabled', async () => {
      delete (deps as { reflexion?: unknown }).reflexion;

      await expect(
        executeRefine(deps as SelfDevWorkflowDependencies, state, createMockPlan())
      ).rejects.toThrow(RefineUnavailableError);
      await expect(
        executeRefine(deps as SelfDevWorkflowDependencies, state, createMockPlan())
      ).rejects.toThrow('ReflexionProtocol not injected');
    });
  });

  describe('without reflexion protocol (heuristic fallback enabled)', () => {
    let fallbackState: SelfDevWorkflowState;

    beforeEach(() => {
      delete (deps as { reflexion?: unknown }).reflexion;
      fallbackState = {
        ...state,
        config: { ...state.config, phases: { refine: { allowHeuristicFallback: true } } },
      } as SelfDevWorkflowState;
    });

    it('returns fallback output when reflexion is undefined', async () => {
      const plan = createMockPlan();
      const result = await executeRefine(deps as SelfDevWorkflowDependencies, fallbackState, plan);

      expect(result.converged).toBe(true);
      expect(result.iterations).toBe(1);
      expect(result.reflexionResult.totalIterations).toBe(1);
      expect(result.reflexionResult.terminationReason).toBe('converged');
      expect(result.reflexionResult.finalOutput).toContain(plan.trinityResult.finalOutput);
    });

    it('builds fallback critiques from all personas', async () => {
      const result = await executeRefine(
        deps as SelfDevWorkflowDependencies,
        fallbackState,
        createMockPlan()
      );

      expect(result.critiques).toHaveLength(SELF_DEV_PERSONAS.length);
      for (let i = 0; i < SELF_DEV_PERSONAS.length; i++) {
        expect(result.critiques[i]!.personaId).toBe(SELF_DEV_PERSONAS[i]!.id);
        expect(result.critiques[i]!.role).toBe(SELF_DEV_PERSONAS[i]!.role);
      }
    });

    it('generates heuristic critiques based on plan content', async () => {
      const result = await executeRefine(
        deps as SelfDevWorkflowDependencies,
        fallbackState,
        createMockPlan()
      );

      // Check that critiques have some content
      for (const critique of result.critiques) {
        expect(critique.issues).toBeDefined();
        expect(critique.suggestions).toBeDefined();
        expect(typeof critique.severity).toBe('number');
      }
    });

    it('preserves refinedPlan from original plan', async () => {
      const plan = createMockPlan();
      const result = await executeRefine(deps as SelfDevWorkflowDependencies, fallbackState, plan);

      expect(result.refinedPlan).toBe(plan.plan);
    });

    it('tracks duration correctly', async () => {
      const startTime = Date.now();
      const result = await executeRefine(
        deps as SelfDevWorkflowDependencies,
        fallbackState,
        createMockPlan()
      );
      const endTime = Date.now();

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeLessThanOrEqual(endTime - startTime + 100);
    });
  });

  describe('edge cases', () => {
    it('throws when missing phase config and no reflexion', async () => {
      // Create a new state with no phases config - should throw by default
      const stateWithNoPhases = {
        executionId: 'test-exec-123',
        currentPhase: 'refine',
        config: { repository: 'owner/repo', targetIssue: 1 },
        checkpoints: [],
        startedAt: new Date().toISOString(),
        status: 'running',
      } as unknown as SelfDevWorkflowState;
      delete (deps as { reflexion?: unknown }).reflexion;

      await expect(
        executeRefine(deps as SelfDevWorkflowDependencies, stateWithNoPhases, createMockPlan())
      ).rejects.toThrow(RefineUnavailableError);
    });

    it('uses fallback when missing phase config but heuristic fallback enabled', async () => {
      // Missing phases.refine but allowHeuristicFallback: true at phases level
      const stateWithFallback = {
        executionId: 'test-exec-123',
        currentPhase: 'refine',
        config: {
          repository: 'owner/repo',
          targetIssue: 1,
          phases: { refine: { allowHeuristicFallback: true } },
        },
        checkpoints: [],
        startedAt: new Date().toISOString(),
        status: 'running',
      } as unknown as SelfDevWorkflowState;
      delete (deps as { reflexion?: unknown }).reflexion;

      const result = await executeRefine(
        deps as SelfDevWorkflowDependencies,
        stateWithFallback,
        createMockPlan()
      );

      expect(result.converged).toBe(true);
      expect(result.iterations).toBe(1);
    });

    it('handles empty expert results', async () => {
      deps.reflexion = {
        execute: vi.fn().mockResolvedValue({
          ok: true,
          value: { success: true, expertResults: [], aggregatedResult: { output: 'Final' } },
        }),
      } as never;

      const result = await executeRefine(deps, state, createMockPlan());

      expect(result.critiques).toHaveLength(0);
      expect(result.finalSeverity).toBe(0);
      expect(result.iterations).toBe(0);
    });

    it('handles expert result with no output', async () => {
      deps.reflexion = {
        execute: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            success: true,
            expertResults: [
              { expertId: 'architect', contributionScore: 0.8, result: undefined },
              { expertId: 'security', contributionScore: 0.8, result: { output: undefined } },
            ],
            aggregatedResult: { output: 'Final' },
          },
        }),
      } as never;

      const result = await executeRefine(deps, state, createMockPlan());

      expect(result.critiques).toHaveLength(2);
      expect(result.critiques[0]!.issues).toHaveLength(0);
      expect(result.critiques[0]!.suggestions).toHaveLength(0);
    });

    it('handles aggregated result with no output', async () => {
      deps.reflexion = {
        execute: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            success: true,
            expertResults: [{ expertId: 'a', contributionScore: 0.8, result: { output: 't' } }],
            aggregatedResult: { output: undefined },
          },
        }),
      } as never;

      const plan = createMockPlan();
      const result = await executeRefine(deps, state, plan);

      expect(result.reflexionResult.finalOutput).toBe(plan.trinityResult.finalOutput);
    });
  });
});
