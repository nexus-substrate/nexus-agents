/**
 * Per-seat fallback disclosure (#6115): the classifier reuses the adapter
 * layer's error classes, and the #6120 in-family model substitution reaches
 * the vote result as a `capacity` fallback.
 */
import { describe, it, expect, vi } from 'vitest';

import type { CompletionResponse, ILogger, IModelAdapter } from '../core/index.js';
import { executeAgentVote } from './voter-agents.js';
import { bareCliName, classifyFallbackReason } from './voter-fallback.js';

const APPROVE = JSON.stringify({
  decision: 'approve',
  reasoning: 'Approve: the diff is small and the empty case is named.',
  confidence: 0.9,
});

function silentLogger(): ILogger {
  const l: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  (l.child as ReturnType<typeof vi.fn>).mockReturnValue(l);
  return l;
}

function claudeAdapter(value: Partial<CompletionResponse>): IModelAdapter {
  return {
    providerId: 'cli-claude',
    modelId: 'claude-opus',
    capabilities: [],
    complete: vi.fn().mockResolvedValue({
      ok: true,
      value: { content: APPROVE, stopReason: 'end_turn', model: 'claude-opus', ...value },
    }),
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(10),
    validateConfig: vi.fn().mockReturnValue({ ok: true }),
  };
}

describe('classifyFallbackReason (#6115) — the adapter layer’s classes, not a new taxonomy', () => {
  it.each([
    ["You're out of usage credits. Switch to another model", 'capacity'],
    ['HTTP 429 Too Many Requests: rate limit exceeded', 'rate-limit'],
    ['Not logged in. Please run /login', 'auth'],
    ['refresh token was already used. Please log out and sign in again.', 'auth'],
    ['bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted', 'sandbox'],
    ['Vote timeout after 90000ms for role: devex', 'timeout'],
    ['Execution timed out', 'timeout'],
  ] as const)('%s → %s', (message, reason) => {
    expect(classifyFallbackReason(message)).toBe(reason);
  });

  it('names the empty case: a message that matches no class is unknown, never a default class', () => {
    expect(classifyFallbackReason('No model adapter available')).toBe('unknown');
    expect(classifyFallbackReason('')).toBe('unknown');
  });

  it('bareCliName strips the adapter prefix and leaves other ids alone', () => {
    expect(bareCliName('cli-claude')).toBe('claude');
    expect(bareCliName('gemini')).toBe('gemini');
    expect(bareCliName('resilient-proxy')).toBe('resilient-proxy');
  });
});

describe('in-family model substitution reaches the vote result (#6120 → #6115)', () => {
  it('a substituted answer carries fallback { fromCli, fromModel, reason: capacity }', async () => {
    const result = await executeAgentVote(
      'architect',
      'Ratify',
      claudeAdapter({ fallbackFrom: 'fable' }),
      silentLogger(),
      { timeoutMs: 5000, maxRetries: 0 }
    );
    expect(result.source).toBe('llm');
    expect(result.model).toBe('claude-opus');
    expect(result.fallback).toEqual({ fromCli: 'claude', fromModel: 'fable', reason: 'capacity' });
  });

  it('an answer from the requested model carries no fallback', async () => {
    const result = await executeAgentVote(
      'architect',
      'Ratify',
      claudeAdapter({}),
      silentLogger(),
      {
        timeoutMs: 5000,
        maxRetries: 0,
      }
    );
    expect(result.source).toBe('llm');
    expect(result.fallback).toBeUndefined();
  });
});
