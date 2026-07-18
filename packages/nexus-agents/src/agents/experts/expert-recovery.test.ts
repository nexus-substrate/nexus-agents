/**
 * nexus-agents/agents/experts - Expert Recovery Tests (#4286)
 *
 * Covers the opt-in transient-vs-permanent execution recovery policy wired into
 * the expert factory. Uses a mock IModelAdapter per expert-factory.test.ts /
 * simple-agent.test.ts conventions, with baseDelayMs: 0 so retries are instant.
 */

import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';
import type { IModelAdapter, CompletionResponse, StreamChunk, Task } from '../../core/index.js';
import { ok, ModelError, AgentError, ErrorCode } from '../../core/index.js';
import { createExpert, Expert } from './expert-factory.js';
import {
  RecoverableExpert,
  classifyExpertFailure,
  type ExpertRecoveryPolicy,
} from './expert-recovery.js';
import { FailureDetector } from '../resilience/index.js';
import type { ExpertConfig } from './expert-config.js';

/** A completion response carrying non-empty text so executeTask succeeds. */
function textResponse(text = 'Recovered output'): CompletionResponse {
  return {
    content: [{ type: 'text', text }],
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    stopReason: 'end_turn',
    model: 'test-model',
  };
}

/**
 * Mock adapter whose `complete` is a vi.fn the test wires with
 * mockResolvedValue/mockRejectedValue sequences.
 */
function createMockAdapter(complete: Mock): IModelAdapter {
  return {
    providerId: 'test-provider',
    modelId: 'test-model',
    capabilities: ['completion'],
    complete,
    stream: vi.fn().mockImplementation(function* (): Iterable<StreamChunk> {
      yield { type: 'message_start', message: { model: 'test-model' } };
      yield { type: 'message_stop' };
    }),
    countTokens: vi.fn().mockResolvedValue(10),
    validateConfig: vi.fn().mockReturnValue(ok(undefined)),
  };
}

function baseConfig(): ExpertConfig {
  return {
    id: 'recovery-expert',
    name: 'Recovery Expert',
    role: 'code_expert',
    systemPrompt: 'You are a test expert.',
    capabilities: ['task_execution'],
  };
}

/** Builds a task; buildPrompt turns description into the last user message. */
function makeTask(description = 'Do the thing'): Task {
  return { id: 'task-1', description, context: {} };
}

/** An Error carrying an HTTP status, as thrown by HTTP-style adapters. */
function statusError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

function createRecoverableExpert(policy: ExpertRecoveryPolicy, complete: Mock): RecoverableExpert {
  const result = createExpert(baseConfig(), {
    adapter: createMockAdapter(complete),
    recoveryPolicy: policy,
  });
  if (!result.ok) throw new Error(`createExpert failed: ${result.error.message}`);
  expect(result.value).toBeInstanceOf(RecoverableExpert);
  return result.value as RecoverableExpert;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('classifyExpertFailure', () => {
  const detector = new FailureDetector();

  it('classifies a caller-aborted signal as permanent (guard, not transient)', () => {
    const controller = new AbortController();
    controller.abort();
    // Message matches /aborted/i which is otherwise transport-retryable.
    const c = classifyExpertFailure(
      new Error('request aborted'),
      detector,
      'task',
      controller.signal
    );
    expect(c).toEqual({ kind: 'permanent', source: 'default' });
  });

  it('classifies a 503 status error as transient transport', () => {
    const c = classifyExpertFailure(statusError(503, 'Service Unavailable'), detector);
    expect(c.kind).toBe('transient');
    expect(c.source).toBe('transport');
  });

  it('classifies a wrapped NexusError rate-limit (via cause chain) as transient', () => {
    const cause = new ModelError('rate limited', { code: ErrorCode.MODEL_RATE_LIMITED });
    const wrapped = new AgentError('Model completion failed: rate limited', { cause });
    expect(classifyExpertFailure(wrapped, detector).kind).toBe('transient');
  });

  it('classifies a 401 as permanent (fail closed)', () => {
    const c = classifyExpertFailure(statusError(401, 'Invalid API key'), detector);
    expect(c.kind).toBe('permanent');
  });

  it('maps a recoverable behavioral archetype to transient/archetype', () => {
    const lowThreshold = new FailureDetector({ confidenceThreshold: 0.1 });
    const c = classifyExpertFailure(
      new Error('failed to parse tool output'),
      lowThreshold,
      'run the tool'
    );
    expect(c.source).toBe('archetype');
    expect(c.kind).toBe('transient');
    expect(c.archetype).toBe('fragile_execution');
  });
});

describe('RecoverableExpert.execute', () => {
  it('retries a transient failure then succeeds (adapter called 2x)', async () => {
    const complete = vi.fn();
    complete.mockRejectedValueOnce(statusError(503, 'Service Unavailable'));
    complete.mockResolvedValueOnce(ok(textResponse('Recovered')));
    const expert = createRecoverableExpert({ maxRetries: 1, baseDelayMs: 0 }, complete);

    const result = await expert.execute(makeTask());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.output).toBe('Recovered');
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('fails closed on a permanent failure without retrying (adapter called 1x)', async () => {
    const complete = vi.fn().mockRejectedValue(statusError(401, 'Invalid API key'));
    const expert = createRecoverableExpert({ maxRetries: 2, baseDelayMs: 0 }, complete);

    const result = await expert.execute(makeTask());

    expect(result.ok).toBe(false);
    expect(complete).toHaveBeenCalledTimes(1);
    if (!result.ok) {
      const recovery = (result.error.context?.['recovery'] ?? {}) as Record<string, unknown>;
      expect(recovery['classification']).toBe('permanent');
    }
  });

  it('retries a recoverable archetype and injects guidance into the retry', async () => {
    const complete = vi.fn();
    complete.mockRejectedValueOnce(new Error('failed to parse tool output'));
    complete.mockResolvedValueOnce(ok(textResponse('Fixed')));
    const expert = createRecoverableExpert(
      { maxRetries: 1, baseDelayMs: 0, detectorConfig: { confidenceThreshold: 0.1 } },
      complete
    );

    const result = await expert.execute(makeTask('call the parser'));

    expect(result.ok).toBe(true);
    expect(complete).toHaveBeenCalledTimes(2);
    // The retried request must carry the injected recovery guidance.
    const secondCall = complete.mock.calls[1]?.[0] as { messages: { content: string }[] };
    const combined = secondCall.messages.map((m) => m.content).join('\n');
    expect(combined).toContain('RECOVERY MODE');
  });

  it('bounds retries: always-503 with maxRetries:2 → exactly 3 attempts', async () => {
    const complete = vi.fn().mockRejectedValue(statusError(503, 'Service Unavailable'));
    const expert = createRecoverableExpert({ maxRetries: 2, baseDelayMs: 0 }, complete);

    const result = await expert.execute(makeTask());

    expect(result.ok).toBe(false);
    expect(complete).toHaveBeenCalledTimes(3);
    if (!result.ok) {
      const recovery = (result.error.context?.['recovery'] ?? {}) as Record<string, unknown>;
      expect(recovery['attempts']).toBe(3);
    }
  });

  it('does not retry when the caller signal is pre-aborted (1 attempt, permanent)', async () => {
    const complete = vi.fn().mockResolvedValue(ok(textResponse()));
    const expert = createRecoverableExpert({ maxRetries: 3, baseDelayMs: 0 }, complete);
    const controller = new AbortController();
    controller.abort();

    const result = await expert.execute(makeTask(), { signal: controller.signal });

    expect(result.ok).toBe(false);
    // Pre-aborted → base execute() returns the cancel error before any model call.
    expect(complete).toHaveBeenCalledTimes(0);
    if (!result.ok) {
      const recovery = (result.error.context?.['recovery'] ?? {}) as Record<string, unknown>;
      expect(recovery['classification']).toBe('permanent');
    }
  });
});

describe('createExpert without a recovery policy (default no-op)', () => {
  it('returns a plain Expert whose failing adapter is called exactly once', async () => {
    const complete = vi.fn().mockRejectedValue(statusError(503, 'Service Unavailable'));
    const result = createExpert(baseConfig(), {
      adapter: createMockAdapter(complete),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeInstanceOf(Expert);
    expect(result.value).not.toBeInstanceOf(RecoverableExpert);

    const execResult = await result.value.execute(makeTask());

    expect(execResult.ok).toBe(false);
    // No recovery wrapper → no retry: exactly one model call.
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
