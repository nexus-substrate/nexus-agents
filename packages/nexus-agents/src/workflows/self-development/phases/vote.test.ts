/**
 * Tests for Phase 5: VOTE (Consensus)
 *
 * @module workflows/self-development/phases/vote.test
 */

import { describe, it, expect, vi } from 'vitest';
import { executeVote, VotingUnavailableError } from './vote.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';
import type {
  SelfDevWorkflowState,
  RefineOutput,
  ImplementationPlan,
  PersonaCritique,
} from '../types.js';
import { SELF_DEV_PERSONAS } from '../types.js';
import { ok } from '../../../core/index.js';
import type { ReflexionResult } from '../../../agents/collaboration/reflexion-types.js';

// Type for mutable dependencies in tests
type MutableDeps = {
  -readonly [K in keyof SelfDevWorkflowDependencies]: SelfDevWorkflowDependencies[K];
};

// =============================================================================
// Test Helpers
// =============================================================================

function createMockDependencies(): MutableDeps {
  return {
    modelAdapter: {
      providerId: 'mock',
      modelId: 'mock-model',
      capabilities: [],
      complete: vi.fn().mockResolvedValue(
        ok({
          content: [{ type: 'text' as const, text: 'Mock response' }],
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          stopReason: 'end_turn' as const,
          model: 'mock-model',
        })
      ),
      stream: vi.fn(),
      countTokens: vi.fn().mockResolvedValue(100),
      validateConfig: vi.fn().mockReturnValue({ ok: true, value: undefined }),
    },
  };
}

function createMockState(overrides?: Partial<SelfDevWorkflowState>): SelfDevWorkflowState {
  return {
    executionId: 'test-exec-123',
    config: {
      repository: 'test/repo',
      workingDirectory: '/tmp/test',
      phases: {
        vote: {
          minVotes: 4,
          requireUnanimous: false,
        },
      },
    },
    currentPhase: 'vote',
    checkpoints: [],
    startedAt: new Date().toISOString(),
    status: 'running',
    ...overrides,
  };
}

function createMockPlan(): ImplementationPlan {
  return {
    problemAnalysis: 'Test problem analysis',
    successCriteria: ['Criterion 1', 'Criterion 2'],
    files: [{ path: 'src/test.ts', action: 'create', description: 'Create test file' }],
    interfaces: ['ITestInterface'],
    dependencies: [],
    testPlan: 'Test plan description',
  };
}

function createMockCritiques(): PersonaCritique[] {
  return [
    {
      personaId: 'architect',
      role: 'Software Architect',
      issues: ['Architecture concern 1'],
      suggestions: ['Architecture suggestion 1'],
      severity: 0.2,
    },
    {
      personaId: 'security',
      role: 'Security Engineer',
      issues: ['Security concern 1'],
      suggestions: ['Security suggestion 1'],
      severity: 0.1,
    },
  ];
}

function createMockReflexionResult(): ReflexionResult {
  return {
    rounds: [],
    finalOutput: 'Refined plan output',
    totalIterations: 2,
    converged: true,
    terminationReason: 'converged',
    totalDurationMs: 1000,
  };
}

function createMockRefineOutput(): RefineOutput {
  return {
    reflexionResult: createMockReflexionResult(),
    refinedPlan: createMockPlan(),
    critiques: createMockCritiques(),
    iterations: 2,
    converged: true,
    finalSeverity: 0.15,
    durationMs: 1000,
  };
}

// =============================================================================
// Helper Function Tests (via executeVote behavior)
// =============================================================================

describe('vote phase', () => {
  describe('parseVoteDecision', () => {
    // We test parseVoteDecision indirectly through consensus protocol results

    it('parses "approve" from contribution', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              {
                expertId: 'architect',
                result: { output: 'I APPROVE this plan. It looks good.' },
              },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.votes[0]?.decision).toBe('approve');
    });

    it('parses "yes" as approve', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              {
                expertId: 'architect',
                result: { output: 'YES, this plan is acceptable.' },
              },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.votes[0]?.decision).toBe('approve');
    });

    it('parses "accept" as approve', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              {
                expertId: 'architect',
                result: { output: 'I accept this implementation.' },
              },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.votes[0]?.decision).toBe('approve');
    });

    it('parses "reject" from contribution', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              {
                expertId: 'architect',
                result: { output: 'I REJECT this plan due to issues.' },
              },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.votes[0]?.decision).toBe('reject');
    });

    it('parses "no" as reject', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              {
                expertId: 'architect',
                result: { output: 'NO, this plan has issues.' },
              },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.votes[0]?.decision).toBe('reject');
    });

    it('parses "deny" as reject', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              {
                expertId: 'architect',
                result: { output: 'I deny this proposal.' },
              },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.votes[0]?.decision).toBe('reject');
    });

    it('defaults to abstain for ambiguous input', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              {
                expertId: 'architect',
                result: { output: 'I need more information to decide.' },
              },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.votes[0]?.decision).toBe('abstain');
    });

    it('handles empty contribution as abstain', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              {
                expertId: 'architect',
                result: { output: '' },
              },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.votes[0]?.decision).toBe('abstain');
    });

    it('handles undefined output as abstain', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              {
                expertId: 'architect',
                result: {},
              },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.votes[0]?.decision).toBe('abstain');
    });
  });

  describe('extractVoteReasoning', () => {
    it('extracts reasoning from "Reason:" prefix', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              {
                expertId: 'architect',
                result: {
                  output: 'I approve.\nReason: The design is clean and follows best practices.',
                },
              },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.votes[0]?.reasoning).toContain('design is clean');
    });

    it('extracts reasoning from "Because" keyword', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              {
                expertId: 'architect',
                result: {
                  output: 'I approve because the implementation is solid.',
                },
              },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.votes[0]?.reasoning).toContain('because');
    });

    it('extracts reasoning from "Rationale:" prefix', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              {
                expertId: 'architect',
                result: {
                  output: 'APPROVE\nRationale: meets all requirements',
                },
              },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.votes[0]?.reasoning).toContain('meets all requirements');
    });

    it('falls back to first substantial line when no keywords', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              {
                expertId: 'architect',
                result: {
                  output:
                    'APPROVE\nThis is a substantial line of reasoning that exceeds twenty characters.',
                },
              },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.votes[0]?.reasoning).toContain('substantial line');
    });

    it('returns default message when no reasoning found', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              {
                expertId: 'architect',
                result: {
                  output: 'yes',
                },
              },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.votes[0]?.reasoning).toBe('No detailed reasoning provided');
    });
  });

  describe('countVotes', () => {
    it('counts approve votes correctly', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              { expertId: 'architect', result: { output: 'approve' } },
              { expertId: 'security', result: { output: 'approve' } },
              { expertId: 'tester', result: { output: 'approve' } },
              { expertId: 'devex', result: { output: 'reject' } },
              { expertId: 'maintainer', result: { output: 'abstain' } },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.approvalCount).toBe(3);
      expect(result.rejectCount).toBe(1);
      expect(result.abstainCount).toBe(1);
    });

    it('counts all rejects correctly', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              { expertId: 'architect', result: { output: 'reject' } },
              { expertId: 'security', result: { output: 'no' } },
              { expertId: 'tester', result: { output: 'deny' } },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.approvalCount).toBe(0);
      expect(result.rejectCount).toBe(3);
    });

    it('counts all abstains correctly', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              { expertId: 'architect', result: { output: 'need more info' } },
              { expertId: 'security', result: { output: 'undecided' } },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.approvalCount).toBe(0);
      expect(result.rejectCount).toBe(0);
      expect(result.abstainCount).toBe(2);
    });
  });

  describe('determineVerdict', () => {
    it('returns REJECTED when veto is exercised', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              { expertId: 'architect', result: { output: 'approve' } },
              { expertId: 'security', result: { output: 'reject' } }, // Security has veto power
              { expertId: 'tester', result: { output: 'approve' } },
              { expertId: 'devex', result: { output: 'approve' } },
              { expertId: 'maintainer', result: { output: 'approve' } },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.vetoExercised).toBe(true);
      expect(result.verdict).toBe('REJECTED');
      expect(result.vetoReason).toBe('Security expert vetoed the proposal');
    });

    it('returns APPROVED when consensus reached without veto', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              { expertId: 'architect', result: { output: 'approve' } },
              { expertId: 'security', result: { output: 'approve' } },
              { expertId: 'tester', result: { output: 'approve' } },
              { expertId: 'devex', result: { output: 'approve' } },
              { expertId: 'maintainer', result: { output: 'abstain' } },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.vetoExercised).toBe(false);
      expect(result.consensus).toBe(true);
      expect(result.verdict).toBe('APPROVED');
    });

    it('returns REQUIRES_REVISION when no consensus and no veto', async () => {
      const deps = createMockDependencies();
      const mockConsensus = {
        execute: vi.fn().mockResolvedValue(
          ok({
            success: true,
            expertResults: [
              { expertId: 'architect', result: { output: 'approve' } },
              { expertId: 'security', result: { output: 'approve' } },
              { expertId: 'tester', result: { output: 'reject' } },
              { expertId: 'devex', result: { output: 'reject' } },
              { expertId: 'maintainer', result: { output: 'reject' } },
            ],
          })
        ),
      };
      deps.consensus = mockConsensus as never;

      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeVote(deps, state, refine);

      expect(result.vetoExercised).toBe(false);
      expect(result.consensus).toBe(false);
      expect(result.verdict).toBe('REQUIRES_REVISION');
    });
  });

  describe('executeVote', () => {
    describe('with consensus protocol', () => {
      it('uses consensus protocol when injected', async () => {
        const deps = createMockDependencies();
        const mockConsensus = {
          execute: vi.fn().mockResolvedValue(
            ok({
              success: true,
              expertResults: SELF_DEV_PERSONAS.map((p) => ({
                expertId: p.id,
                result: { output: 'approve' },
              })),
            })
          ),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine = createMockRefineOutput();

        const result = await executeVote(deps, state, refine);

        expect(mockConsensus.execute).toHaveBeenCalledTimes(1);
        expect(result.votes.length).toBe(5);
        expect(result.consensus).toBe(true);
        expect(result.verdict).toBe('APPROVED');
      });

      it('passes correct config to consensus protocol', async () => {
        const deps = createMockDependencies();
        const mockConsensus = {
          execute: vi.fn().mockResolvedValue(
            ok({
              success: true,
              expertResults: [],
            })
          ),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState({
          config: {
            repository: 'test/repo',
            workingDirectory: '/tmp/test',
            phases: {
              vote: {
                minVotes: 3,
                requireUnanimous: true,
              },
            },
          },
        });
        const refine = createMockRefineOutput();

        await executeVote(deps, state, refine);

        expect(mockConsensus.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            pattern: 'consensus',
            minVotes: 3,
            requireUnanimous: true,
          }),
          expect.any(Map)
        );
      });

      it('creates agents from all personas', async () => {
        const deps = createMockDependencies();
        let capturedAgents: Map<string, unknown> | undefined;
        const mockConsensus = {
          execute: vi.fn().mockImplementation((_config, agents) => {
            capturedAgents = agents;
            return Promise.resolve(
              ok({
                success: true,
                expertResults: [],
              })
            );
          }),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine = createMockRefineOutput();

        await executeVote(deps, state, refine);

        expect(capturedAgents).toBeDefined();
        expect(capturedAgents?.size).toBe(5);
        expect(capturedAgents?.has('architect')).toBe(true);
        expect(capturedAgents?.has('security')).toBe(true);
        expect(capturedAgents?.has('tester')).toBe(true);
        expect(capturedAgents?.has('devex')).toBe(true);
        expect(capturedAgents?.has('maintainer')).toBe(true);
      });

      it('throws VotingUnavailableError when consensus protocol fails (Issue #501)', async () => {
        const deps = createMockDependencies();
        const mockConsensus = {
          execute: vi.fn().mockResolvedValue({
            ok: false,
            error: { message: 'Consensus failed' },
          }),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine = createMockRefineOutput();

        // Should throw error by default - no fake votes
        await expect(executeVote(deps, state, refine)).rejects.toThrow(VotingUnavailableError);
      });

      it('falls back to heuristic when consensus fails AND allowHeuristicFallback is true', async () => {
        const deps = createMockDependencies();
        const mockConsensus = {
          execute: vi.fn().mockResolvedValue({
            ok: false,
            error: { message: 'Consensus failed' },
          }),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState({
          config: {
            repository: 'test/repo',
            workingDirectory: '/tmp/test',
            phases: {
              vote: {
                minVotes: 4,
                requireUnanimous: false,
                allowHeuristicFallback: true, // Explicitly enabled
              },
            },
          },
        });
        const refine = createMockRefineOutput();

        // Should fall back to heuristic output when explicitly allowed
        const result = await executeVote(deps, state, refine);

        expect(result.votes.length).toBeGreaterThan(0);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('assigns veto power to security expert', async () => {
        const deps = createMockDependencies();
        const mockConsensus = {
          execute: vi.fn().mockResolvedValue(
            ok({
              success: true,
              expertResults: SELF_DEV_PERSONAS.map((p) => ({
                expertId: p.id,
                result: { output: 'approve' },
              })),
            })
          ),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine = createMockRefineOutput();

        const result = await executeVote(deps, state, refine);

        const securityVote = result.votes.find((v) => v.expertId === 'security');
        const architectVote = result.votes.find((v) => v.expertId === 'architect');

        expect(securityVote?.hasVetoPower).toBe(true);
        expect(architectVote?.hasVetoPower).toBe(false);
      });

      it('assigns correct agent roles from personas', async () => {
        const deps = createMockDependencies();
        const mockConsensus = {
          execute: vi.fn().mockResolvedValue(
            ok({
              success: true,
              expertResults: SELF_DEV_PERSONAS.map((p) => ({
                expertId: p.id,
                result: { output: 'approve' },
              })),
            })
          ),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine = createMockRefineOutput();

        const result = await executeVote(deps, state, refine);

        const architectVote = result.votes.find((v) => v.expertId === 'architect');
        expect(architectVote?.agentRole).toBe('Software Architect');

        const securityVote = result.votes.find((v) => v.expertId === 'security');
        expect(securityVote?.agentRole).toBe('Security Engineer');
      });
    });

    describe('fail-safe behavior (Issue #501)', () => {
      it('throws VotingUnavailableError by default when consensus protocol not injected', async () => {
        const deps = createMockDependencies();
        // No consensus protocol injected

        const state = createMockState();
        const refine = createMockRefineOutput();

        await expect(executeVote(deps, state, refine)).rejects.toThrow(VotingUnavailableError);
        await expect(executeVote(deps, state, refine)).rejects.toThrow(
          'ConsensusProtocol not injected'
        );
      });

      it('throws VotingUnavailableError when consensus execution fails', async () => {
        const deps = createMockDependencies();
        const mockConsensus = {
          execute: vi.fn().mockResolvedValue({
            ok: false,
            error: new Error('Consensus failed'),
          }),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine = createMockRefineOutput();

        await expect(executeVote(deps, state, refine)).rejects.toThrow(VotingUnavailableError);
        await expect(executeVote(deps, state, refine)).rejects.toThrow(
          'ConsensusProtocol execution failed'
        );
      });

      it('error message includes guidance to enable heuristic fallback', async () => {
        const deps = createMockDependencies();
        const state = createMockState();
        const refine = createMockRefineOutput();

        await expect(executeVote(deps, state, refine)).rejects.toThrow(
          'allowHeuristicFallback = true'
        );
      });
    });

    describe('heuristic fallback behavior (when explicitly enabled)', () => {
      it('uses heuristic fallback when allowHeuristicFallback is true', async () => {
        const deps = createMockDependencies();
        // No consensus protocol injected

        const state = createMockState({
          config: {
            repository: 'test/repo',
            workingDirectory: '/tmp/test',
            phases: {
              vote: {
                minVotes: 4,
                requireUnanimous: false,
                allowHeuristicFallback: true, // Explicitly enabled
              },
            },
          },
        });
        const refine = createMockRefineOutput();

        const result = await executeVote(deps, state, refine);

        expect(result.votes.length).toBeGreaterThan(0);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('heuristic fallback creates correct number of votes based on minVotes', async () => {
        const deps = createMockDependencies();

        const state = createMockState({
          config: {
            repository: 'test/repo',
            workingDirectory: '/tmp/test',
            phases: {
              vote: {
                minVotes: 3,
                requireUnanimous: false,
                allowHeuristicFallback: true,
              },
            },
          },
        });
        const refine = createMockRefineOutput();

        const result = await executeVote(deps, state, refine);

        // Fallback creates min(minVotes + 2, SELF_DEV_PERSONAS.length) votes
        // With minVotes=3, that's min(5, 5) = 5 votes
        expect(result.votes.length).toBe(5);
      });

      it('heuristic fallback approves based on severity evaluation', async () => {
        const deps = createMockDependencies();

        const state = createMockState({
          config: {
            repository: 'test/repo',
            workingDirectory: '/tmp/test',
            phases: {
              vote: {
                minVotes: 3,
                requireUnanimous: false,
                allowHeuristicFallback: true,
              },
            },
          },
        });
        const refine = createMockRefineOutput();

        const result = await executeVote(deps, state, refine);

        // With low severity (0.15 < 0.3), most or all will approve
        expect(result.approvalCount).toBeGreaterThanOrEqual(3);
        expect(result.votes.length).toBe(5);
      });

      it('heuristic fallback uses default minVotes of 4 when not configured', async () => {
        const deps = createMockDependencies();

        const state = createMockState({
          config: {
            repository: 'test/repo',
            workingDirectory: '/tmp/test',
            phases: {
              vote: {
                allowHeuristicFallback: true,
              },
            },
          },
        });
        const refine = createMockRefineOutput();

        const result = await executeVote(deps, state, refine);

        // With 5 personas, minVotes=4, slice creates 5 votes (min(6, 5))
        // All use defaultVote since evaluator role keys don't match persona.role strings
        // With low severity (0.15 < 0.3), all default to approve
        expect(result.votes.length).toBe(5);
        expect(result.approvalCount).toBeGreaterThanOrEqual(4);
      });

      it('heuristic fallback reaches consensus when approvals >= minVotes', async () => {
        const deps = createMockDependencies();

        const state = createMockState({
          config: {
            repository: 'test/repo',
            workingDirectory: '/tmp/test',
            phases: {
              vote: {
                minVotes: 3,
                requireUnanimous: false,
                allowHeuristicFallback: true,
              },
            },
          },
        });
        const refine = createMockRefineOutput();

        const result = await executeVote(deps, state, refine);

        expect(result.consensus).toBe(true);
        expect(result.verdict).toBe('APPROVED');
      });

      it('heuristic fallback includes severity-based reasoning', async () => {
        const deps = createMockDependencies();

        const state = createMockState({
          config: {
            repository: 'test/repo',
            workingDirectory: '/tmp/test',
            phases: {
              vote: {
                minVotes: 4,
                requireUnanimous: false,
                allowHeuristicFallback: true,
              },
            },
          },
        });
        // Default refine has finalSeverity = 0.15 (< 0.3)
        const refine = createMockRefineOutput();

        const result = await executeVote(deps, state, refine);

        // With finalSeverity < 0.3, reasoning should mention quality threshold
        expect(result.votes[0]?.reasoning).toContain('meets quality threshold');
      });

      it('heuristic fallback includes different reasoning for higher severity', async () => {
        const deps = createMockDependencies();

        const state = createMockState({
          config: {
            repository: 'test/repo',
            workingDirectory: '/tmp/test',
            phases: {
              vote: {
                minVotes: 4,
                requireUnanimous: false,
                allowHeuristicFallback: true,
              },
            },
          },
        });
        const refine: RefineOutput = {
          ...createMockRefineOutput(),
          finalSeverity: 0.5, // Higher severity
        };

        const result = await executeVote(deps, state, refine);

        // With finalSeverity >= 0.3, reasoning should mention minor concerns
        expect(result.votes[0]?.reasoning).toContain('Minor concerns remain');
      });

      it('heuristic fallback never exercises veto', async () => {
        const deps = createMockDependencies();

        const state = createMockState({
          config: {
            repository: 'test/repo',
            workingDirectory: '/tmp/test',
            phases: {
              vote: {
                minVotes: 4,
                requireUnanimous: false,
                allowHeuristicFallback: true,
              },
            },
          },
        });
        const refine = createMockRefineOutput();

        const result = await executeVote(deps, state, refine);

        expect(result.vetoExercised).toBe(false);
      });

      it('heuristic fallback has zero abstain count', async () => {
        const deps = createMockDependencies();

        const state = createMockState({
          config: {
            repository: 'test/repo',
            workingDirectory: '/tmp/test',
            phases: {
              vote: {
                minVotes: 4,
                requireUnanimous: false,
                allowHeuristicFallback: true,
              },
            },
          },
        });
        const refine = createMockRefineOutput();

        const result = await executeVote(deps, state, refine);

        expect(result.abstainCount).toBe(0);
      });
    });

    describe('voting task construction', () => {
      it('builds voting prompt with plan summary', async () => {
        const deps = createMockDependencies();
        let capturedConfig: { task?: { description?: string } } | undefined;
        const mockConsensus = {
          execute: vi.fn().mockImplementation((config) => {
            capturedConfig = config;
            return Promise.resolve(
              ok({
                success: true,
                expertResults: [],
              })
            );
          }),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine = createMockRefineOutput();

        await executeVote(deps, state, refine);

        const taskDescription = capturedConfig?.task?.description ?? '';
        expect(taskDescription).toContain('Vote on the following implementation plan');
        expect(taskDescription).toContain('## Plan Summary');
        expect(taskDescription).toContain(refine.refinedPlan.problemAnalysis);
      });

      it('builds voting prompt with success criteria', async () => {
        const deps = createMockDependencies();
        let capturedConfig: { task?: { description?: string } } | undefined;
        const mockConsensus = {
          execute: vi.fn().mockImplementation((config) => {
            capturedConfig = config;
            return Promise.resolve(
              ok({
                success: true,
                expertResults: [],
              })
            );
          }),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine = createMockRefineOutput();

        await executeVote(deps, state, refine);

        const taskDescription = capturedConfig?.task?.description ?? '';
        expect(taskDescription).toContain('## Success Criteria');
        expect(taskDescription).toContain('- Criterion 1');
        expect(taskDescription).toContain('- Criterion 2');
      });

      it('builds voting prompt with refinement results', async () => {
        const deps = createMockDependencies();
        let capturedConfig: { task?: { description?: string } } | undefined;
        const mockConsensus = {
          execute: vi.fn().mockImplementation((config) => {
            capturedConfig = config;
            return Promise.resolve(
              ok({
                success: true,
                expertResults: [],
              })
            );
          }),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine = createMockRefineOutput();

        await executeVote(deps, state, refine);

        const taskDescription = capturedConfig?.task?.description ?? '';
        expect(taskDescription).toContain('## Refinement Results');
        expect(taskDescription).toContain('Iterations: 2');
        expect(taskDescription).toContain('Converged: true');
        expect(taskDescription).toContain('Final Severity: 0.15');
      });

      it('builds voting prompt with outstanding critiques', async () => {
        const deps = createMockDependencies();
        let capturedConfig: { task?: { description?: string } } | undefined;
        const mockConsensus = {
          execute: vi.fn().mockImplementation((config) => {
            capturedConfig = config;
            return Promise.resolve(
              ok({
                success: true,
                expertResults: [],
              })
            );
          }),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine = createMockRefineOutput();

        await executeVote(deps, state, refine);

        const taskDescription = capturedConfig?.task?.description ?? '';
        expect(taskDescription).toContain('## Outstanding Critiques');
        expect(taskDescription).toContain('[Software Architect]');
        expect(taskDescription).toContain('Architecture concern 1');
      });

      it('builds voting prompt with vote instructions', async () => {
        const deps = createMockDependencies();
        let capturedConfig: { task?: { description?: string } } | undefined;
        const mockConsensus = {
          execute: vi.fn().mockImplementation((config) => {
            capturedConfig = config;
            return Promise.resolve(
              ok({
                success: true,
                expertResults: [],
              })
            );
          }),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine = createMockRefineOutput();

        await executeVote(deps, state, refine);

        const taskDescription = capturedConfig?.task?.description ?? '';
        expect(taskDescription).toContain('Vote: APPROVE, REJECT, or ABSTAIN with reasoning.');
      });

      it('includes task constraints', async () => {
        const deps = createMockDependencies();
        let capturedConfig:
          | { task?: { constraints?: { maxTokens?: number; maxDuration?: number } } }
          | undefined;
        const mockConsensus = {
          execute: vi.fn().mockImplementation((config) => {
            capturedConfig = config;
            return Promise.resolve(
              ok({
                success: true,
                expertResults: [],
              })
            );
          }),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine = createMockRefineOutput();

        await executeVote(deps, state, refine);

        expect(capturedConfig?.task?.constraints?.maxTokens).toBe(2000);
        expect(capturedConfig?.task?.constraints?.maxDuration).toBe(120000);
      });
    });

    describe('duration tracking', () => {
      it('tracks duration in milliseconds', async () => {
        const deps = createMockDependencies();
        const mockConsensus = {
          execute: vi.fn().mockResolvedValue(
            ok({
              success: true,
              expertResults: [],
            })
          ),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine = createMockRefineOutput();

        const result = await executeVote(deps, state, refine);

        expect(typeof result.durationMs).toBe('number');
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });
    });

    describe('edge cases', () => {
      it('handles unknown expert ID gracefully', async () => {
        const deps = createMockDependencies();
        const mockConsensus = {
          execute: vi.fn().mockResolvedValue(
            ok({
              success: true,
              expertResults: [{ expertId: 'unknown_expert', result: { output: 'approve' } }],
            })
          ),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine = createMockRefineOutput();

        const result = await executeVote(deps, state, refine);

        // Unknown expert should get default role 'reviewer'
        expect(result.votes[0]?.agentRole).toBe('reviewer');
        expect(result.votes[0]?.hasVetoPower).toBe(false);
      });

      it('handles mixed case vote decisions', async () => {
        const deps = createMockDependencies();
        const mockConsensus = {
          execute: vi.fn().mockResolvedValue(
            ok({
              success: true,
              expertResults: [
                { expertId: 'architect', result: { output: 'APPROVE' } },
                { expertId: 'security', result: { output: 'Approve' } },
                { expertId: 'tester', result: { output: 'approve' } },
              ],
            })
          ),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine = createMockRefineOutput();

        const result = await executeVote(deps, state, refine);

        expect(result.approvalCount).toBe(3);
      });

      it('handles numeric-like output gracefully', async () => {
        const deps = createMockDependencies();
        const mockConsensus = {
          execute: vi.fn().mockResolvedValue(
            ok({
              success: true,
              expertResults: [{ expertId: 'architect', result: { output: 123 } }],
            })
          ),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine = createMockRefineOutput();

        const result = await executeVote(deps, state, refine);

        // Numeric output should be converted to string and result in abstain
        expect(result.votes[0]?.decision).toBe('abstain');
      });

      it('handles empty critiques in refine output', async () => {
        const deps = createMockDependencies();
        let capturedConfig: { task?: { description?: string } } | undefined;
        const mockConsensus = {
          execute: vi.fn().mockImplementation((config) => {
            capturedConfig = config;
            return Promise.resolve(
              ok({
                success: true,
                expertResults: [],
              })
            );
          }),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine: RefineOutput = {
          ...createMockRefineOutput(),
          critiques: [],
        };

        await executeVote(deps, state, refine);

        const taskDescription = capturedConfig?.task?.description ?? '';
        expect(taskDescription).toContain('## Outstanding Critiques');
        // Should not crash with empty critiques
      });

      it('handles empty success criteria', async () => {
        const deps = createMockDependencies();
        let capturedConfig: { task?: { description?: string } } | undefined;
        const mockConsensus = {
          execute: vi.fn().mockImplementation((config) => {
            capturedConfig = config;
            return Promise.resolve(
              ok({
                success: true,
                expertResults: [],
              })
            );
          }),
        };
        deps.consensus = mockConsensus as never;

        const state = createMockState();
        const refine: RefineOutput = {
          ...createMockRefineOutput(),
          refinedPlan: {
            ...createMockPlan(),
            successCriteria: [],
          },
        };

        await executeVote(deps, state, refine);

        const taskDescription = capturedConfig?.task?.description ?? '';
        expect(taskDescription).toContain('## Success Criteria');
        // Should not crash with empty criteria
      });
    });
  });
});
