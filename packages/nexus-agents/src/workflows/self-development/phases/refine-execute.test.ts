/**
 * REFINE Phase Tests - executeRefine
 *
 * Tests for the executeRefine function with reflexion protocol.
 *
 * @module workflows/self-development/phases/refine-execute.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeRefine } from './refine.js';
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

    it('falls back when reflexion protocol fails', async () => {
      deps.reflexion = {
        execute: vi.fn().mockResolvedValue({ ok: false, error: { message: 'Failed' } }),
      } as never;

      const result = await executeRefine(deps, state, createMockPlan());

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

  describe('without reflexion protocol (fallback)', () => {
    it('returns fallback output when reflexion is undefined', async () => {
      delete (deps as { reflexion?: unknown }).reflexion;
      const plan = createMockPlan();
      const result = await executeRefine(deps as SelfDevWorkflowDependencies, state, plan);

      expect(result.converged).toBe(true);
      expect(result.iterations).toBe(1);
      expect(result.reflexionResult.totalIterations).toBe(1);
      expect(result.reflexionResult.terminationReason).toBe('converged');
      expect(result.reflexionResult.finalOutput).toBe(plan.trinityResult.finalOutput);
    });

    it('builds fallback critiques from all personas', async () => {
      delete (deps as { reflexion?: unknown }).reflexion;
      const result = await executeRefine(
        deps as SelfDevWorkflowDependencies,
        state,
        createMockPlan()
      );

      expect(result.critiques).toHaveLength(SELF_DEV_PERSONAS.length);
      for (let i = 0; i < SELF_DEV_PERSONAS.length; i++) {
        expect(result.critiques[i]!.personaId).toBe(SELF_DEV_PERSONAS[i]!.id);
        expect(result.critiques[i]!.role).toBe(SELF_DEV_PERSONAS[i]!.role);
        expect(result.critiques[i]!.issues).toHaveLength(0);
        expect(result.critiques[i]!.suggestions).toHaveLength(1);
        expect(result.critiques[i]!.severity).toBe(0.1);
      }
    });

    it('includes focus areas in fallback suggestions', async () => {
      delete (deps as { reflexion?: unknown }).reflexion;
      const result = await executeRefine(
        deps as SelfDevWorkflowDependencies,
        state,
        createMockPlan()
      );

      for (let i = 0; i < SELF_DEV_PERSONAS.length; i++) {
        const suggestion = result.critiques[i]!.suggestions[0];
        expect(suggestion).toContain('Consider');
        expect(suggestion).toContain(SELF_DEV_PERSONAS[i]!.focusAreas[0]);
      }
    });

    it('sets finalSeverity to 0 and preserves refinedPlan', async () => {
      delete (deps as { reflexion?: unknown }).reflexion;
      const plan = createMockPlan();
      const result = await executeRefine(deps as SelfDevWorkflowDependencies, state, plan);

      expect(result.finalSeverity).toBe(0);
      expect(result.refinedPlan).toBe(plan.plan);
    });

    it('tracks duration correctly', async () => {
      delete (deps as { reflexion?: unknown }).reflexion;
      const startTime = Date.now();
      const result = await executeRefine(
        deps as SelfDevWorkflowDependencies,
        state,
        createMockPlan()
      );
      const endTime = Date.now();

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeLessThanOrEqual(endTime - startTime + 100);
    });
  });

  describe('edge cases', () => {
    it('handles missing phase config', async () => {
      // Create a new state with no phases config
      const stateWithNoPhases = {
        executionId: 'test-exec-123',
        currentPhase: 'refine',
        config: { repository: 'owner/repo', targetIssue: 1 },
        checkpoints: [],
        startedAt: new Date().toISOString(),
        status: 'running',
      } as unknown as SelfDevWorkflowState;
      delete (deps as { reflexion?: unknown }).reflexion;

      const result = await executeRefine(
        deps as SelfDevWorkflowDependencies,
        stateWithNoPhases,
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
