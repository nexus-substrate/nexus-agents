/**
 * Tests for logical→live model-id resolution (#3407).
 */
import { describe, it, expect } from 'vitest';

import { resolveLiveModelId } from './resolve-live-model.js';

describe('resolveLiveModelId (#3407)', () => {
  it('returns the input unchanged when the catalog is empty (fail-open)', () => {
    expect(resolveLiveModelId('qwen/qwen3-coder:free', [])).toBe('qwen/qwen3-coder:free');
  });

  it('returns the input unchanged when it is already offered (exact match wins)', () => {
    const live = new Set(['qwen/qwen3-coder:free', 'meta/llama']);
    expect(resolveLiveModelId('qwen/qwen3-coder:free', live)).toBe('qwen/qwen3-coder:free');
  });

  it('resolves the real OpenRouter rename to the live :free id', () => {
    // The exact case the owner hit: 480b-a35b:free → :free.
    const live = new Set([
      'qwen/qwen3-coder:free',
      'qwen/qwen3-coder',
      'qwen/qwen3-coder-30b-a3b-instruct',
    ]);
    expect(resolveLiveModelId('qwen/qwen3-coder-480b-a35b:free', live)).toBe(
      'qwen/qwen3-coder:free'
    );
  });

  it('prefers a non-free match for a non-free configured id', () => {
    const live = new Set(['qwen/qwen3-coder:free', 'qwen/qwen3-coder']);
    expect(resolveLiveModelId('qwen/qwen3-coder-480b-a35b', live)).toBe('qwen/qwen3-coder');
  });

  it('never substitutes across provider namespaces', () => {
    const live = new Set(['anthropic/claude-3-5-haiku', 'google/gemini-3-pro']);
    // No qwen/* candidate → unchanged.
    expect(resolveLiveModelId('qwen/qwen3-coder-480b:free', live)).toBe(
      'qwen/qwen3-coder-480b:free'
    );
  });

  it('does not substitute when overlap is below the safety threshold', () => {
    // Same provider but a wildly different model — must NOT be chosen.
    const live = new Set(['openai/gpt-5', 'openai/o3-pro']);
    expect(resolveLiveModelId('openai/text-embedding-3-large', live)).toBe(
      'openai/text-embedding-3-large'
    );
  });

  it('is deterministic across input orderings', () => {
    const a = resolveLiveModelId('qwen/qwen3-coder-480b:free', [
      'qwen/qwen3-coder',
      'qwen/qwen3-coder:free',
    ]);
    const b = resolveLiveModelId('qwen/qwen3-coder-480b:free', [
      'qwen/qwen3-coder:free',
      'qwen/qwen3-coder',
    ]);
    expect(a).toBe(b);
    expect(a).toBe('qwen/qwen3-coder:free');
  });
});
