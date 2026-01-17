/**
 * Tests for IMPLEMENT phase of Self-Development Workflow
 *
 * @module workflows/self-development/phases/implement.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeImplement } from './implement.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';
import type { SelfDevWorkflowState, RefineOutput, ImplementationPlan } from '../types.js';
import { ok, err } from '../../../core/index.js';
import type { SelfDebugProtocol } from '../../../agents/collaboration/self-debug-protocol.js';
import type { SelfRefineProtocol } from '../../../agents/collaboration/self-refine-protocol.js';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock model adapter for testing.
 */
function createMockModelAdapter(
  responseText = '// FILE: src/test.ts\nconst x = 1;'
): SelfDevWorkflowDependencies['modelAdapter'] {
  return {
    providerId: 'mock',
    modelId: 'mock-model',
    capabilities: [],
    complete: vi.fn().mockResolvedValue(
      ok({
        content: [{ type: 'text' as const, text: responseText }],
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        stopReason: 'end_turn' as const,
        model: 'mock-model',
      })
    ),
    stream: vi.fn().mockReturnValue(
      (async function* (): AsyncGenerator<{ type: 'message_stop' }> {
        await Promise.resolve();
        yield { type: 'message_stop' as const };
      })()
    ),
    countTokens: vi.fn().mockResolvedValue(100),
    validateConfig: vi.fn().mockReturnValue({ ok: true, value: undefined }),
  };
}

/**
 * Create a mock implementation plan for testing.
 */
function createMockImplementationPlan(
  overrides: Partial<ImplementationPlan> = {}
): ImplementationPlan {
  return {
    problemAnalysis: 'Test problem analysis',
    successCriteria: ['Criterion 1', 'Criterion 2'],
    files: [
      { path: 'src/new-file.ts', action: 'create', description: 'New feature file' },
      { path: 'src/existing.ts', action: 'modify', description: 'Update existing' },
    ],
    interfaces: ['ITestInterface'],
    dependencies: [],
    testPlan: 'Test plan description',
    ...overrides,
  };
}

/**
 * Create a mock RefineOutput for testing.
 */
function createMockRefineOutput(planOverrides: Partial<ImplementationPlan> = {}): RefineOutput {
  return {
    reflexionResult: {
      rounds: [],
      finalOutput: 'Refined proposal',
      totalIterations: 1,
      converged: true,
      terminationReason: 'converged',
      totalDurationMs: 100,
    },
    refinedPlan: createMockImplementationPlan(planOverrides),
    critiques: [],
    iterations: 1,
    converged: true,
    finalSeverity: 0.1,
    durationMs: 100,
  };
}

/**
 * Create a mock workflow state for testing.
 */
function createMockState(): SelfDevWorkflowState {
  return {
    executionId: 'test-execution-id',
    config: {
      repository: 'test/repo',
      workingDirectory: '/tmp/test',
    },
    currentPhase: 'implement',
    status: 'running',
    checkpoints: [],
    startedAt: new Date().toISOString(),
  };
}

/**
 * Create mock dependencies with optional overrides.
 */
function createMockDependencies(
  overrides: Partial<SelfDevWorkflowDependencies> = {}
): SelfDevWorkflowDependencies {
  return {
    modelAdapter: createMockModelAdapter(),
    ...overrides,
  };
}

// =============================================================================
// Helper Function Tests (via executeImplement behavior)
// =============================================================================

describe('implement phase', () => {
  describe('buildImplementPrompt', () => {
    it('includes problem analysis in prompt', async () => {
      const deps = createMockDependencies();
      const state = createMockState();
      const refine = createMockRefineOutput({
        problemAnalysis: 'Unique problem analysis text',
      });

      await executeImplement(deps, state, refine);

      const mockComplete = deps.modelAdapter.complete as ReturnType<typeof vi.fn>;
      expect(mockComplete).toHaveBeenCalledTimes(1);
      const callArgs = mockComplete.mock.calls[0]?.[0] as { messages: { content: string }[] };
      expect(callArgs.messages[0]?.content).toContain('Unique problem analysis text');
    });

    it('includes file list in prompt', async () => {
      const deps = createMockDependencies();
      const state = createMockState();
      const refine = createMockRefineOutput({
        files: [
          { path: 'src/feature.ts', action: 'create', description: 'Feature impl' },
          { path: 'src/util.ts', action: 'modify', description: 'Utility update' },
        ],
      });

      await executeImplement(deps, state, refine);

      const mockComplete = deps.modelAdapter.complete as ReturnType<typeof vi.fn>;
      const callArgs = mockComplete.mock.calls[0]?.[0] as { messages: { content: string }[] };
      expect(callArgs.messages[0]?.content).toContain('create: src/feature.ts');
      expect(callArgs.messages[0]?.content).toContain('modify: src/util.ts');
    });

    it('includes success criteria in prompt', async () => {
      const deps = createMockDependencies();
      const state = createMockState();
      const refine = createMockRefineOutput({
        successCriteria: ['All tests pass', 'No lint errors'],
      });

      await executeImplement(deps, state, refine);

      const mockComplete = deps.modelAdapter.complete as ReturnType<typeof vi.fn>;
      const callArgs = mockComplete.mock.calls[0]?.[0] as { messages: { content: string }[] };
      expect(callArgs.messages[0]?.content).toContain('All tests pass');
      expect(callArgs.messages[0]?.content).toContain('No lint errors');
    });

    it('includes test plan in prompt', async () => {
      const deps = createMockDependencies();
      const state = createMockState();
      const refine = createMockRefineOutput({
        testPlan: 'Unit tests for all public methods',
      });

      await executeImplement(deps, state, refine);

      const mockComplete = deps.modelAdapter.complete as ReturnType<typeof vi.fn>;
      const callArgs = mockComplete.mock.calls[0]?.[0] as { messages: { content: string }[] };
      expect(callArgs.messages[0]?.content).toContain('Unit tests for all public methods');
    });
  });

  describe('parseImplementationFiles', () => {
    it('parses single file marker', async () => {
      const deps = createMockDependencies({
        modelAdapter: createMockModelAdapter('// FILE: src/main.ts\nconst a = 1;'),
      });
      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeImplement(deps, state, refine);

      expect(result.filesCreated).toContain('src/main.ts');
    });

    it('parses multiple file markers', async () => {
      const multiFileOutput = `
// FILE: src/feature.ts
export function feature() { return true; }

// FILE: src/utils/helper.ts
export function helper() { return 42; }

// FILE: tests/feature.test.ts
import { feature } from '../src/feature';
`;
      const deps = createMockDependencies({
        modelAdapter: createMockModelAdapter(multiFileOutput),
      });
      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeImplement(deps, state, refine);

      expect(result.filesCreated).toContain('src/feature.ts');
      expect(result.filesCreated).toContain('src/utils/helper.ts');
      expect(result.filesCreated).toContain('tests/feature.test.ts');
      expect(result.filesCreated).toHaveLength(3);
    });

    it('handles file markers with extra whitespace', async () => {
      const deps = createMockDependencies({
        modelAdapter: createMockModelAdapter('//   FILE:   src/spaced.ts\ncode here'),
      });
      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeImplement(deps, state, refine);

      expect(result.filesCreated).toContain('src/spaced.ts');
    });

    it('handles paths with dashes and underscores', async () => {
      const deps = createMockDependencies({
        modelAdapter: createMockModelAdapter('// FILE: src/my-feature/helper_utils.ts\ncode'),
      });
      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeImplement(deps, state, refine);

      expect(result.filesCreated).toContain('src/my-feature/helper_utils.ts');
    });

    it('handles paths with dots', async () => {
      const deps = createMockDependencies({
        modelAdapter: createMockModelAdapter('// FILE: src/config.default.ts\nconst cfg = {}'),
      });
      const state = createMockState();
      const refine = createMockRefineOutput();

      const result = await executeImplement(deps, state, refine);

      expect(result.filesCreated).toContain('src/config.default.ts');
    });

    it('returns empty arrays when no file markers found', async () => {
      const noFileMarkerOutput = `
export function something() {
  return 'no file markers here';
}
`;
      const deps = createMockDependencies({
        modelAdapter: createMockModelAdapter(noFileMarkerOutput),
      });
      const state = createMockState();
      const refine = createMockRefineOutput({
        files: [{ path: 'fallback.ts', action: 'create', description: 'Test' }],
      });

      const result = await executeImplement(deps, state, refine);

      // Should fall back to plan files
      expect(result.filesCreated).toContain('fallback.ts');
    });
  });

  describe('categorizeFilesFromPlan', () => {
    it('categorizes create actions as created', async () => {
      const deps = createMockDependencies({
        modelAdapter: createMockModelAdapter('no file markers'),
      });
      const state = createMockState();
      const refine = createMockRefineOutput({
        files: [
          { path: 'new1.ts', action: 'create', description: 'New file 1' },
          { path: 'new2.ts', action: 'create', description: 'New file 2' },
        ],
      });

      const result = await executeImplement(deps, state, refine);

      expect(result.filesCreated).toContain('new1.ts');
      expect(result.filesCreated).toContain('new2.ts');
      expect(result.filesModified).toHaveLength(0);
    });

    it('categorizes modify actions as modified', async () => {
      const deps = createMockDependencies({
        modelAdapter: createMockModelAdapter('no file markers'),
      });
      const state = createMockState();
      const refine = createMockRefineOutput({
        files: [
          { path: 'existing1.ts', action: 'modify', description: 'Update file 1' },
          { path: 'existing2.ts', action: 'modify', description: 'Update file 2' },
        ],
      });

      const result = await executeImplement(deps, state, refine);

      expect(result.filesModified).toContain('existing1.ts');
      expect(result.filesModified).toContain('existing2.ts');
      expect(result.filesCreated).toHaveLength(0);
    });

    it('categorizes delete actions as modified', async () => {
      const deps = createMockDependencies({
        modelAdapter: createMockModelAdapter('no file markers'),
      });
      const state = createMockState();
      const refine = createMockRefineOutput({
        files: [{ path: 'to-delete.ts', action: 'delete', description: 'Remove file' }],
      });

      const result = await executeImplement(deps, state, refine);

      // Delete actions go to modified (else branch)
      expect(result.filesModified).toContain('to-delete.ts');
      expect(result.filesCreated).toHaveLength(0);
    });

    it('handles mixed actions correctly', async () => {
      const deps = createMockDependencies({
        modelAdapter: createMockModelAdapter('no file markers'),
      });
      const state = createMockState();
      const refine = createMockRefineOutput({
        files: [
          { path: 'new.ts', action: 'create', description: 'New' },
          { path: 'update.ts', action: 'modify', description: 'Update' },
          { path: 'remove.ts', action: 'delete', description: 'Delete' },
        ],
      });

      const result = await executeImplement(deps, state, refine);

      expect(result.filesCreated).toEqual(['new.ts']);
      expect(result.filesModified).toEqual(['update.ts', 'remove.ts']);
    });
  });
});

// =============================================================================
// executeImplement Tests
// =============================================================================

describe('executeImplement', () => {
  let deps: SelfDevWorkflowDependencies;
  let state: SelfDevWorkflowState;
  let refine: RefineOutput;

  beforeEach(() => {
    deps = createMockDependencies();
    state = createMockState();
    refine = createMockRefineOutput();
  });

  describe('successful execution', () => {
    it('returns success when model responds', async () => {
      const result = await executeImplement(deps, state, refine);

      expect(result.success).toBe(true);
    });

    it('returns correct files from parsed output', async () => {
      deps = createMockDependencies({
        modelAdapter: createMockModelAdapter(
          '// FILE: src/impl.ts\ncode\n// FILE: src/impl2.ts\ncode'
        ),
      });

      const result = await executeImplement(deps, state, refine);

      expect(result.filesCreated).toHaveLength(2);
      expect(result.filesCreated).toContain('src/impl.ts');
      expect(result.filesCreated).toContain('src/impl2.ts');
    });

    it('sets selfRefineIterations to 1 on success', async () => {
      const result = await executeImplement(deps, state, refine);

      expect(result.selfRefineIterations).toBe(1);
    });

    it('sets selfDebugIterations to 0', async () => {
      const result = await executeImplement(deps, state, refine);

      expect(result.selfDebugIterations).toBe(0);
    });

    it('includes duration in result', async () => {
      const result = await executeImplement(deps, state, refine);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('generates summary with file count', async () => {
      deps = createMockDependencies({
        modelAdapter: createMockModelAdapter('// FILE: src/a.ts\ncode\n// FILE: src/b.ts\ncode'),
      });

      const result = await executeImplement(deps, state, refine);

      expect(result.summary).toBe('Implemented 2 files');
    });
  });

  describe('model adapter interactions', () => {
    it('calls model adapter complete method', async () => {
      await executeImplement(deps, state, refine);

      expect(deps.modelAdapter.complete).toHaveBeenCalledTimes(1);
    });

    it('passes system prompt to model adapter', async () => {
      await executeImplement(deps, state, refine);

      const mockComplete = deps.modelAdapter.complete as ReturnType<typeof vi.fn>;
      const callArgs = mockComplete.mock.calls[0]?.[0] as { systemPrompt: string };
      expect(callArgs.systemPrompt).toContain('expert code implementer');
      expect(callArgs.systemPrompt).toContain('TypeScript');
    });

    it('requests max 4000 tokens', async () => {
      await executeImplement(deps, state, refine);

      const mockComplete = deps.modelAdapter.complete as ReturnType<typeof vi.fn>;
      const callArgs = mockComplete.mock.calls[0]?.[0] as { maxTokens: number };
      expect(callArgs.maxTokens).toBe(4000);
    });
  });

  describe('fallback to plan files', () => {
    it('uses plan files when output has no file markers', async () => {
      deps = createMockDependencies({
        modelAdapter: createMockModelAdapter('Plain text response without markers'),
      });
      refine = createMockRefineOutput({
        files: [{ path: 'plan-file.ts', action: 'create', description: 'From plan' }],
      });

      const result = await executeImplement(deps, state, refine);

      expect(result.filesCreated).toContain('plan-file.ts');
    });

    it('uses plan files when model response fails', async () => {
      const failingAdapter = createMockModelAdapter();
      failingAdapter.complete = vi.fn().mockResolvedValue(err(new Error('Model error')));
      deps = createMockDependencies({ modelAdapter: failingAdapter });
      refine = createMockRefineOutput({
        files: [{ path: 'fallback.ts', action: 'create', description: 'Fallback' }],
      });

      const result = await executeImplement(deps, state, refine);

      expect(result.filesCreated).toContain('fallback.ts');
      expect(result.success).toBe(true);
    });

    it('categorizes plan files correctly on fallback', async () => {
      deps = createMockDependencies({
        modelAdapter: createMockModelAdapter('no markers'),
      });
      refine = createMockRefineOutput({
        files: [
          { path: 'new.ts', action: 'create', description: 'New' },
          { path: 'old.ts', action: 'modify', description: 'Existing' },
        ],
      });

      const result = await executeImplement(deps, state, refine);

      expect(result.filesCreated).toEqual(['new.ts']);
      expect(result.filesModified).toEqual(['old.ts']);
    });
  });

  describe('optional protocol logging', () => {
    it('logs when selfDebug protocol is available', async () => {
      const mockSelfDebug = {
        execute: vi.fn(),
        cancel: vi.fn(),
      } as unknown as SelfDebugProtocol;
      deps = createMockDependencies({ selfDebug: mockSelfDebug });

      // Should not throw - just logs availability
      const result = await executeImplement(deps, state, refine);

      expect(result.success).toBe(true);
    });

    it('logs when selfRefine protocol is available', async () => {
      const mockSelfRefine = {
        execute: vi.fn(),
        cancel: vi.fn(),
        pattern: 'self-refine' as const,
      } as unknown as SelfRefineProtocol;
      deps = createMockDependencies({ selfRefine: mockSelfRefine });

      // Should not throw - just logs availability
      const result = await executeImplement(deps, state, refine);

      expect(result.success).toBe(true);
    });

    it('works without optional protocols', async () => {
      deps = createMockDependencies();
      // No selfDebug or selfRefine

      const result = await executeImplement(deps, state, refine);

      expect(result.success).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles empty files list in plan', async () => {
      deps = createMockDependencies({
        modelAdapter: createMockModelAdapter('no markers'),
      });
      refine = createMockRefineOutput({ files: [] });

      const result = await executeImplement(deps, state, refine);

      expect(result.filesCreated).toEqual([]);
      expect(result.filesModified).toEqual([]);
      expect(result.summary).toBe('Implemented 0 files');
    });

    it('handles empty response content', async () => {
      deps = createMockDependencies({
        modelAdapter: createMockModelAdapter(''),
      });
      refine = createMockRefineOutput({
        files: [{ path: 'backup.ts', action: 'create', description: 'Backup' }],
      });

      const result = await executeImplement(deps, state, refine);

      // Falls back to plan files
      expect(result.filesCreated).toContain('backup.ts');
    });

    it('handles response with non-text content', async () => {
      const adapter = createMockModelAdapter();
      adapter.complete = vi.fn().mockResolvedValue(
        ok({
          content: [{ type: 'tool_use' as const, id: 'tool1', name: 'test', input: {} }],
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          stopReason: 'end_turn' as const,
          model: 'mock-model',
        })
      );
      deps = createMockDependencies({ modelAdapter: adapter });
      refine = createMockRefineOutput({
        files: [{ path: 'plan.ts', action: 'create', description: 'Plan file' }],
      });

      const result = await executeImplement(deps, state, refine);

      // Falls back to plan files since content[0] is not text
      expect(result.filesCreated).toContain('plan.ts');
    });

    it('handles response with empty content array', async () => {
      const adapter = createMockModelAdapter();
      adapter.complete = vi.fn().mockResolvedValue(
        ok({
          content: [],
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          stopReason: 'end_turn' as const,
          model: 'mock-model',
        })
      );
      deps = createMockDependencies({ modelAdapter: adapter });
      refine = createMockRefineOutput({
        files: [{ path: 'fallback.ts', action: 'create', description: 'Fallback' }],
      });

      const result = await executeImplement(deps, state, refine);

      // Falls back to plan files
      expect(result.filesCreated).toContain('fallback.ts');
    });

    it('handles multiple files with same name (deduplication)', async () => {
      deps = createMockDependencies({
        modelAdapter: createMockModelAdapter(
          '// FILE: src/dup.ts\nfirst\n// FILE: src/dup.ts\nsecond'
        ),
      });

      const result = await executeImplement(deps, state, refine);

      // Both markers are captured (no deduplication in current impl)
      expect(result.filesCreated.filter((f) => f === 'src/dup.ts')).toHaveLength(2);
    });

    it('handles very long file paths', async () => {
      const longPath = 'src/' + 'a/'.repeat(20) + 'deep-file.ts';
      deps = createMockDependencies({
        modelAdapter: createMockModelAdapter(`// FILE: ${longPath}\ncode`),
      });

      const result = await executeImplement(deps, state, refine);

      expect(result.filesCreated).toContain(longPath);
    });

    it('ignores invalid file markers (special characters)', async () => {
      deps = createMockDependencies({
        modelAdapter: createMockModelAdapter(
          '// FILE: src/valid.ts\ncode\n// FILE: invalid path with spaces.ts\ncode'
        ),
      });

      const result = await executeImplement(deps, state, refine);

      // Only valid path should be captured
      expect(result.filesCreated).toContain('src/valid.ts');
      // Invalid path should not match regex (contains spaces)
      expect(result.filesCreated).not.toContain('invalid path with spaces.ts');
    });
  });

  describe('state parameter usage', () => {
    it('does not modify the state parameter', async () => {
      const originalState = { ...state };

      await executeImplement(deps, state, refine);

      expect(state).toEqual(originalState);
    });
  });

  describe('timing measurements', () => {
    it('measures duration correctly', async () => {
      const startTime = Date.now();
      const result = await executeImplement(deps, state, refine);
      const endTime = Date.now();

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeLessThanOrEqual(endTime - startTime + 100);
    });
  });
});
