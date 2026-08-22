/**
 * Tests for the Model→CLI adapter bridge (#3422).
 */
import { describe, it, expect, vi } from 'vitest';

import { createModelToCliAdapter } from './model-to-cli-adapter.js';
import { ok, err, ModelError, type IModelAdapter, type CompletionResponse } from '../core/index.js';

function makeModelAdapter(overrides: Partial<IModelAdapter> = {}): IModelAdapter {
  return {
    providerId: 'anthropic',
    modelId: 'claude-opus',
    capabilities: [],
    complete: vi.fn(),
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(10),
    validateConfig: vi.fn().mockReturnValue(ok(undefined)),
    ...overrides,
  };
}

const COMPLETION: CompletionResponse = {
  content: [{ type: 'text', text: 'hello from the api' }],
  usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
  stopReason: 'end_turn',
  model: 'claude-opus',
};

describe('ModelToCliAdapter (#3422)', () => {
  it('exposes the configured display CLI slot as name (not the arm id)', () => {
    const adapter = createModelToCliAdapter(makeModelAdapter(), { name: 'claude' });
    expect(adapter.name).toBe('claude');
  });

  it('maps a successful complete() to a CliResponse with text/usage/model', async () => {
    const complete = vi.fn().mockResolvedValue(ok(COMPLETION));
    const adapter = createModelToCliAdapter(makeModelAdapter({ complete }), { name: 'claude' });

    const result = await adapter.execute({ content: 'hi' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toBe('hello from the api');
      expect(result.value.usage).toEqual({ inputTokens: 120, outputTokens: 80, totalTokens: 200 });
      expect(result.value.model).toBe('claude-opus');
    }
  });

  it('forwards systemPrompt, maxTokens, and a per-call timeout into the request', async () => {
    const complete = vi.fn().mockResolvedValue(ok(COMPLETION));
    const adapter = createModelToCliAdapter(makeModelAdapter({ complete }), { name: 'codex' });

    await adapter.execute(
      { content: 'hi', systemPrompt: 'be terse', maxTokens: 256 },
      { timeoutMs: 9000 }
    );

    const req = complete.mock.calls[0]?.[0];
    expect(req).toMatchObject({
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompt: 'be terse',
      maxTokens: 256,
      timeoutMs: 9000,
    });
  });

  it('maps a rate-limit ModelError to a retryable RATE_LIMITED CliError', async () => {
    const complete = vi.fn().mockResolvedValue(err(new ModelError('429 rate limit exceeded')));
    const adapter = createModelToCliAdapter(makeModelAdapter({ complete }), { name: 'gemini' });

    const result = await adapter.execute({ content: 'hi' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('RATE_LIMITED');
      expect(result.error.retryable).toBe(true);
      expect(result.error.cli).toBe('gemini');
    }
  });

  it('maps a generic ModelError to a non-retryable EXECUTION_ERROR CliError', async () => {
    const complete = vi.fn().mockResolvedValue(err(new ModelError('upstream 500')));
    const adapter = createModelToCliAdapter(makeModelAdapter({ complete }), { name: 'claude' });

    const result = await adapter.execute({ content: 'hi' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EXECUTION_ERROR');
      expect(result.error.retryable).toBe(false);
    }
  });

  it('reports healthy when the model adapter config validates', async () => {
    const adapter = createModelToCliAdapter(makeModelAdapter(), { name: 'claude' });
    const health = await adapter.healthCheck();
    expect(health.healthy).toBe(true);
  });

  it('reports non-exhausted capacity (API rate limits surface via execute)', async () => {
    const adapter = createModelToCliAdapter(makeModelAdapter(), { name: 'claude' });
    const cap = await adapter.getCapacity();
    expect(cap.rateLimited).toBe(false);
  });

  it('delegates listModels to the model adapter when present', async () => {
    const listModels = vi.fn().mockResolvedValue([{ id: 'claude-opus', ownedBy: 'anthropic' }]);
    const adapter = createModelToCliAdapter(makeModelAdapter({ listModels }), { name: 'claude' });

    const models = await adapter.listModels();

    expect(models).toEqual([{ id: 'claude-opus', provider: 'anthropic' }]);
  });

  it('returns an empty model list when the adapter has no listModels surface', async () => {
    const adapter = createModelToCliAdapter(makeModelAdapter(), { name: 'claude' });
    expect(await adapter.listModels()).toEqual([]);
  });
});
