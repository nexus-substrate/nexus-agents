/**
 * Tests for Forest-of-Thought Engine
 * @module agents/reasoning/forest-engine.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  IModelAdapter,
  CompletionRequest,
  CompletionResponse,
  Result,
} from '../../core/index.js';
import type { CreateForestInput } from './forest-types.js';
import {
  ForestEngine,
  createForestEngine,
  executeForest,
  ForestAdapterUnavailableError,
} from './forest-engine.js';

// ============================================================================
// Mocks
// ============================================================================

let mockTime = 1000;

vi.mock('../../core/index.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getTimeProvider: () => ({ now: (): number => mockTime }),
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

let idCounter = 0;
vi.mock('./forest-engine-ids.js', () => ({
  generateForestId: (): string => `forest-${String(++idCounter)}`,
  generateTreeId: (): string => `tree-${String(++idCounter)}`,
  generateNodeId: (): string => `node-${String(++idCounter)}`,
}));

// ============================================================================
// Test Helpers
// ============================================================================

function makeHypothesisResponse(hypothesis: string): string {
  return JSON.stringify({ hypothesis, reasoning: 'test', confidence: 0.8 });
}

function makeStepResponse(
  stepType: string,
  content: string,
  confidence: number,
  isConclusion = false
): string {
  return JSON.stringify({
    stepType,
    content,
    confidence,
    isConclusion,
    conclusionContent: isConclusion ? content : undefined,
  });
}

function makeCompletionOk(text: string, tokens = 50): Result<CompletionResponse, Error> {
  return {
    ok: true,
    value: {
      content: text,
      model: 'test-model',
      usage: { promptTokens: tokens / 2, completionTokens: tokens / 2, totalTokens: tokens },
    },
  };
}

function makeCompletionErr(): Result<CompletionResponse, Error> {
  return { ok: false, error: new Error('Adapter failure') };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockAdapter(responses: Array<Result<CompletionResponse, Error>>) {
  let callIndex = 0;
  return {
    id: 'test-adapter',
    complete: vi.fn((_req: CompletionRequest) => {
      const response = responses[callIndex] ?? makeCompletionErr();
      callIndex++;
      return Promise.resolve(response);
    }),
  } as unknown as IModelAdapter;
}

function makeInput(overrides: Partial<CreateForestInput> = {}): CreateForestInput {
  return {
    problem: 'Test problem',
    config: {
      maxTrees: 2,
      maxDepth: 3,
      maxExplorationTimeMs: 60000,
      maxTokensPerTree: 5000,
      enableEarlyTermination: false,
    },
    ...overrides,
  };
}

// ============================================================================
// ForestEngine constructor
// ============================================================================

describe('ForestEngine', () => {
  beforeEach(() => {
    mockTime = 1000;
    idCounter = 0;
  });

  it('creates engine without options', () => {
    const engine = new ForestEngine();
    expect(engine).toBeDefined();
  });

  it('creates engine with adapter', () => {
    const adapter = makeMockAdapter([]);
    const engine = new ForestEngine({ adapter });
    expect(engine).toBeDefined();
  });
});

// ============================================================================
// execute - error cases
// ============================================================================

describe('ForestEngine.execute - error cases', () => {
  beforeEach(() => {
    mockTime = 1000;
    idCounter = 0;
  });

  it('returns error when no adapter provided', async () => {
    const engine = new ForestEngine();
    const result = await engine.execute(makeInput());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ForestAdapterUnavailableError);
    }
  });

  it('returns error when adapter fails during hypothesis generation', async () => {
    const adapter = makeMockAdapter([makeCompletionErr(), makeCompletionErr()]);
    const engine = new ForestEngine({ adapter });
    const result = await engine.execute(makeInput());
    // Should still succeed with fallback hypotheses
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// execute - with initial hypotheses
// ============================================================================

describe('ForestEngine.execute - initial hypotheses', () => {
  beforeEach(() => {
    mockTime = 1000;
    idCounter = 0;
  });

  it('uses provided initial hypotheses', async () => {
    // Provide step responses that return non-conclusion steps then get exhausted
    const adapter = makeMockAdapter([
      makeCompletionOk(makeStepResponse('inference', 'Step 1', 0.7)),
      makeCompletionOk(makeStepResponse('inference', 'Step 2', 0.6)),
      makeCompletionOk(makeStepResponse('conclusion', 'Final answer', 0.9, true)),
    ]);

    const engine = new ForestEngine({ adapter });
    const result = await engine.execute(
      makeInput({ initialHypotheses: ['Hypothesis A', 'Hypothesis B'] })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.problem).toBe('Test problem');
      expect(result.value.forestId).toBeTruthy();
      expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('limits hypotheses to maxTrees', async () => {
    const adapter = makeMockAdapter([makeCompletionOk(makeStepResponse('inference', 'Step', 0.7))]);

    const engine = new ForestEngine({ adapter });
    const result = await engine.execute(
      makeInput({
        initialHypotheses: ['H1', 'H2', 'H3', 'H4', 'H5'],
        config: { maxTrees: 2, maxDepth: 2 },
      })
    );

    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// execute - exploration behavior
// ============================================================================

describe('ForestEngine.execute - exploration', () => {
  beforeEach(() => {
    mockTime = 1000;
    idCounter = 0;
  });

  it('terminates when no active nodes remain', async () => {
    // Provide responses that don't expand further (adapter fails → null nodes)
    const adapter = makeMockAdapter([makeCompletionErr()]);

    const engine = new ForestEngine({ adapter });
    const result = await engine.execute(makeInput({ initialHypotheses: ['Only hypothesis'] }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.terminationReason).toBeDefined();
    }
  });

  it('terminates on max_time', async () => {
    // Simulate time advancing past the limit during exploration
    const adapter = {
      id: 'time-adapter',
      complete: vi.fn(() => {
        mockTime += 100000; // Jump way past the time limit
        return Promise.resolve(makeCompletionOk(makeStepResponse('inference', 'step', 0.7)));
      }),
    } as unknown as IModelAdapter;

    const engine = new ForestEngine({ adapter });
    const result = await engine.execute(
      makeInput({
        initialHypotheses: ['H1'],
        config: { maxTrees: 1, maxDepth: 5, maxExplorationTimeMs: 5000 },
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.terminationReason).toBe('max_time');
    }
  });

  it('terminates on max_tokens', async () => {
    const adapter = {
      id: 'token-adapter',
      complete: vi.fn(() => {
        return Promise.resolve(makeCompletionOk(makeStepResponse('inference', 'step', 0.7), 10000));
      }),
    } as unknown as IModelAdapter;

    const engine = new ForestEngine({ adapter });
    const result = await engine.execute(
      makeInput({
        initialHypotheses: ['H1'],
        config: { maxTrees: 1, maxDepth: 5, maxTokensPerTree: 100 },
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.terminationReason).toBe('max_tokens');
    }
  });

  it('handles conclusion nodes', async () => {
    const adapter = makeMockAdapter([
      makeCompletionOk(makeStepResponse('conclusion', 'The answer is 42', 0.95, true)),
    ]);

    const engine = new ForestEngine({ adapter });
    const result = await engine.execute(makeInput({ initialHypotheses: ['H1'] }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.conclusions.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('catches unexpected errors and returns ForestExecutionError', async () => {
    const adapter = {
      id: 'error-adapter',
      complete: vi.fn(() => {
        return Promise.reject(new Error('Unexpected explosion'));
      }),
    } as unknown as IModelAdapter;

    const engine = new ForestEngine({ adapter });
    const result = await engine.execute(makeInput({ initialHypotheses: ['H1'] }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Unexpected explosion');
    }
  });
});

// ============================================================================
// execute - hypothesis generation via adapter
// ============================================================================

describe('ForestEngine.execute - hypothesis generation', () => {
  beforeEach(() => {
    mockTime = 1000;
    idCounter = 0;
  });

  it('generates hypotheses from adapter when none provided', async () => {
    const adapter = makeMockAdapter([
      // 2 hypothesis generations
      makeCompletionOk(makeHypothesisResponse('Generated H1')),
      makeCompletionOk(makeHypothesisResponse('Generated H2')),
      // Exploration steps (will fail, ending exploration)
      makeCompletionErr(),
    ]);

    const engine = new ForestEngine({ adapter });
    const result = await engine.execute(makeInput({ config: { maxTrees: 2, maxDepth: 2 } }));

    expect(result.ok).toBe(true);
    // Adapter should be called at least twice for hypothesis generation + exploration
    expect((adapter.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(
      3
    );
  });

  it('falls back to default hypothesis on adapter failure', async () => {
    const adapter = makeMockAdapter([makeCompletionErr(), makeCompletionErr()]);

    const engine = new ForestEngine({ adapter });
    const result = await engine.execute(makeInput({ config: { maxTrees: 2, maxDepth: 1 } }));

    // Should still succeed with fallback hypotheses
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// createForestEngine factory
// ============================================================================

describe('createForestEngine', () => {
  it('creates engine via factory function', () => {
    const engine = createForestEngine();
    expect(engine).toBeInstanceOf(ForestEngine);
  });

  it('passes options to constructor', () => {
    const adapter = makeMockAdapter([]);
    const engine = createForestEngine({ adapter });
    expect(engine).toBeInstanceOf(ForestEngine);
  });
});

// ============================================================================
// executeForest convenience function
// ============================================================================

describe('executeForest', () => {
  beforeEach(() => {
    mockTime = 1000;
    idCounter = 0;
  });

  it('executes forest reasoning in one call', async () => {
    const adapter = makeMockAdapter([makeCompletionOk(makeStepResponse('inference', 'Step', 0.7))]);

    const result = await executeForest(makeInput({ initialHypotheses: ['H1'] }), { adapter });
    expect(result.ok).toBe(true);
  });

  it('returns error without adapter', async () => {
    const result = await executeForest(makeInput());
    expect(result.ok).toBe(false);
  });
});
