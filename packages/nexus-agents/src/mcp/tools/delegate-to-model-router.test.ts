/**
 * Tests for Delegate to Model Router Integration
 * @module mcp/tools/delegate-to-model-router.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { ILogger } from '../../core/index.js';
import type { IFeedbackIntegration } from '../../learning/feedback-integration.js';
import { MODEL_CAPABILITIES } from './delegate-to-model-types.js';
import {
  cliNameToModel,
  mapCompositeDecisionToOutput,
  routeViaCompositeRouter,
  recordRoutingOutcome,
} from './delegate-to-model-router.js';

// ============================================================================
// Test Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  } as unknown as ILogger;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeDecision(overrides: Record<string, unknown> = {}) {
  return {
    cliName: 'claude' as const,
    confidence: 0.9,
    reason: 'Best model for reasoning tasks',
    stagesExecuted: ['budget', 'zero', 'topsis'],
    decisionTimeMs: 42,
    alternatives: ['gemini', 'codex'] as const,
    topsisScore: 0.85,
    adapter: {} as never,
    taskProfile: {} as never,
    ...overrides,
  };
}

// ============================================================================
// cliNameToModel
// ============================================================================

describe('cliNameToModel', () => {
  it('maps claude to default model from registry', () => {
    expect(cliNameToModel('claude')).toBe('claude-fable-5');
  });

  it('maps gemini to default model from registry', () => {
    expect(cliNameToModel('gemini')).toBe('gemini-3-pro');
  });

  it('maps codex to default model from registry', () => {
    expect(cliNameToModel('codex')).toBe('gpt-5.5');
  });
});

// ============================================================================
// mapCompositeDecisionToOutput
// ============================================================================

describe('mapCompositeDecisionToOutput', () => {
  it('maps decision to output with correct model name', () => {
    const decision = makeDecision();
    const output = mapCompositeDecisionToOutput(decision, 500);

    expect(output.recommended_model).toBe('claude-fable-5');
    expect(output.reasoning).toBe('Best model for reasoning tasks');
    expect(output.estimated_tokens).toBe(500);
  });

  it('prefers decision.model over the CLI default when present (#3394)', () => {
    const decision = makeDecision({ model: 'claude-sonnet' });
    const output = mapCompositeDecisionToOutput(decision, 500);

    expect(output.recommended_model).toBe('claude-sonnet');
  });

  it('falls back to the CLI default when decision.model is absent (#3394)', () => {
    const decision = makeDecision();
    const output = mapCompositeDecisionToOutput(decision, 500);

    expect(output.recommended_model).toBe('claude-fable-5');
  });

  it('includes capabilities from MODEL_CAPABILITIES', () => {
    const decision = makeDecision();
    const output = mapCompositeDecisionToOutput(decision, 100);
    const expected = MODEL_CAPABILITIES['claude-fable-5'];

    expect(output.capabilities).toEqual(expected);
  });

  it('uses default capabilities for unknown model', () => {
    const decision = makeDecision({ cliName: 'unknown' });
    const output = mapCompositeDecisionToOutput(decision, 200);

    expect(output.capabilities).toEqual({
      reasoning: 8,
      contextWindow: 200_000,
      codeGeneration: 8,
      speed: 7,
      cost: 6,
    });
  });

  it('slices alternatives to max 3', () => {
    const decision = makeDecision({
      alternatives: ['gemini', 'codex', 'claude', 'gemini', 'codex'],
    });
    const output = mapCompositeDecisionToOutput(decision, 100);

    expect(output.alternatives).toHaveLength(3);
  });

  it('maps alternative cli names to model names', () => {
    const decision = makeDecision({ alternatives: ['gemini', 'codex'] });
    const output = mapCompositeDecisionToOutput(decision, 100);

    expect(output.alternatives[0]!.model).toBe('gemini-3-pro');
    expect(output.alternatives[1]!.model).toBe('gpt-5.5');
  });

  it('uses topsisScore for alternative scores', () => {
    const decision = makeDecision({ topsisScore: 0.92 });
    const output = mapCompositeDecisionToOutput(decision, 100);

    expect(output.alternatives[0]!.score).toBe(0.92);
  });

  it('falls back to 0.7 when topsisScore is undefined', () => {
    const decision = makeDecision({ topsisScore: undefined });
    const output = mapCompositeDecisionToOutput(decision, 100);

    expect(output.alternatives[0]!.score).toBe(0.7);
  });

  it('handles empty alternatives array', () => {
    const decision = makeDecision({ alternatives: [] });
    const output = mapCompositeDecisionToOutput(decision, 100);

    expect(output.alternatives).toEqual([]);
  });

  it('sets tradeoff to alternative option', () => {
    const decision = makeDecision({ alternatives: ['codex'] });
    const output = mapCompositeDecisionToOutput(decision, 100);

    expect(output.alternatives[0]!.tradeoff).toBe('alternative option');
  });

  it('handles zero estimated tokens', () => {
    const decision = makeDecision();
    const output = mapCompositeDecisionToOutput(decision, 0);

    expect(output.estimated_tokens).toBe(0);
  });

  it('produces gemini capabilities for gemini decision', () => {
    const decision = makeDecision({ cliName: 'gemini' });
    const output = mapCompositeDecisionToOutput(decision, 100);

    expect(output.capabilities).toEqual(MODEL_CAPABILITIES['gemini-3-pro']);
  });

  it('produces codex capabilities for codex decision', () => {
    const decision = makeDecision({ cliName: 'codex' });
    const output = mapCompositeDecisionToOutput(decision, 100);

    expect(output.capabilities).toEqual(MODEL_CAPABILITIES['gpt-5.5']);
  });
});

// ============================================================================
// routeViaCompositeRouter — success paths
// ============================================================================

describe('routeViaCompositeRouter', () => {
  it('returns decision on successful routing', async () => {
    const decision = makeDecision();
    const router = {
      route: vi.fn().mockImplementation(() => Promise.resolve({ ok: true, value: decision })),
    };
    const logger = makeLogger();

    const result = await routeViaCompositeRouter(
      'analyze code',
      router as never,
      undefined,
      logger
    );

    expect(result).not.toBeNull();
    expect(result!.decision).toBe(decision);
    expect(result!.routingId).toBeUndefined();
  });

  it('passes task content to router', async () => {
    const router = {
      route: vi.fn().mockImplementation(() => Promise.resolve({ ok: true, value: makeDecision() })),
    };
    const logger = makeLogger();

    await routeViaCompositeRouter('my task', router as never, undefined, logger);

    expect(router.route).toHaveBeenCalledWith({ content: 'my task' });
  });

  it('records routing decision when feedback integration provided', async () => {
    const decision = makeDecision();
    const router = {
      route: vi.fn().mockImplementation(() => Promise.resolve({ ok: true, value: decision })),
    };
    const feedback: Partial<IFeedbackIntegration> = {
      recordRoutingDecision: vi.fn().mockReturnValue('routing-123'),
    };
    const logger = makeLogger();

    const result = await routeViaCompositeRouter(
      'task',
      router as never,
      feedback as IFeedbackIntegration,
      logger
    );

    expect(result!.routingId).toBe('routing-123');
    expect(feedback.recordRoutingDecision).toHaveBeenCalledWith(decision);
  });

  it('logs debug message with routing id', async () => {
    const decision = makeDecision();
    const router = {
      route: vi.fn().mockImplementation(() => Promise.resolve({ ok: true, value: decision })),
    };
    const feedback: Partial<IFeedbackIntegration> = {
      recordRoutingDecision: vi.fn().mockReturnValue('r-456'),
    };
    const logger = makeLogger();

    await routeViaCompositeRouter(
      'task',
      router as never,
      feedback as IFeedbackIntegration,
      logger
    );

    expect(logger.debug).toHaveBeenCalledWith('Recorded routing decision', {
      routingId: 'r-456',
      cliName: 'claude',
    });
  });

  // ============================================================================
  // routeViaCompositeRouter — error paths
  // ============================================================================

  it('returns null on routing failure', async () => {
    const router = {
      route: vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ ok: false, error: new Error('routing failed') })
        ),
    };
    const logger = makeLogger();

    const result = await routeViaCompositeRouter('task', router as never, undefined, logger);

    expect(result).toBeNull();
  });

  it('logs warning on routing failure', async () => {
    const router = {
      route: vi
        .fn()
        .mockImplementation(() => Promise.resolve({ ok: false, error: new Error('timeout') })),
    };
    const logger = makeLogger();

    await routeViaCompositeRouter('task', router as never, undefined, logger);

    expect(logger.warn).toHaveBeenCalledWith('CompositeRouter routing failed', {
      error: 'timeout',
    });
  });

  it('does not record feedback on routing failure', async () => {
    const router = {
      route: vi
        .fn()
        .mockImplementation(() => Promise.resolve({ ok: false, error: new Error('fail') })),
    };
    const feedback: Partial<IFeedbackIntegration> = {
      recordRoutingDecision: vi.fn(),
    };
    const logger = makeLogger();

    await routeViaCompositeRouter(
      'task',
      router as never,
      feedback as IFeedbackIntegration,
      logger
    );

    expect(feedback.recordRoutingDecision).not.toHaveBeenCalled();
  });

  it('does not call feedback when feedback is undefined on success', async () => {
    const router = {
      route: vi.fn().mockImplementation(() => Promise.resolve({ ok: true, value: makeDecision() })),
    };
    const logger = makeLogger();

    const result = await routeViaCompositeRouter('task', router as never, undefined, logger);

    expect(result).not.toBeNull();
    expect(result!.routingId).toBeUndefined();
    expect(logger.debug).not.toHaveBeenCalled();
  });
});

// ============================================================================
// recordRoutingOutcome (#1168)
// ============================================================================

describe('recordRoutingOutcome', () => {
  it('marks success=true when TOPSIS score >= 0.6', () => {
    const feedback = {
      recordRoutingDecision: vi.fn(),
      recordOutcome: vi.fn(),
    } as unknown as IFeedbackIntegration;
    const logger = makeLogger();

    recordRoutingOutcome(
      {
        decision: makeDecision({ topsisScore: 0.85 }),
        routingId: 'r-1',
        feedbackIntegration: feedback,
      },
      100,
      logger
    );

    expect(feedback.recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, qualityScore: 0.85 })
    );
  });

  it('marks success=false when TOPSIS score < 0.6', () => {
    const feedback = {
      recordRoutingDecision: vi.fn(),
      recordOutcome: vi.fn(),
    } as unknown as IFeedbackIntegration;
    const logger = makeLogger();

    recordRoutingOutcome(
      {
        decision: makeDecision({ topsisScore: 0.4 }),
        routingId: 'r-2',
        feedbackIntegration: feedback,
      },
      100,
      logger
    );

    expect(feedback.recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, qualityScore: 0.4 })
    );
  });

  it('skips recording when routingId is missing', () => {
    const feedback = {
      recordRoutingDecision: vi.fn(),
      recordOutcome: vi.fn(),
    } as unknown as IFeedbackIntegration;
    const logger = makeLogger();

    recordRoutingOutcome(
      { decision: makeDecision(), routingId: undefined, feedbackIntegration: feedback },
      100,
      logger
    );

    expect(feedback.recordOutcome).not.toHaveBeenCalled();
  });

  it('defaults qualityScore to 0 when topsisScore is undefined', () => {
    const feedback = {
      recordRoutingDecision: vi.fn(),
      recordOutcome: vi.fn(),
    } as unknown as IFeedbackIntegration;
    const logger = makeLogger();

    recordRoutingOutcome(
      {
        decision: makeDecision({ topsisScore: undefined }),
        routingId: 'r-3',
        feedbackIntegration: feedback,
      },
      100,
      logger
    );

    expect(feedback.recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, qualityScore: 0 })
    );
  });
});
