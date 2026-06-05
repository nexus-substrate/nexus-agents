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

  it('does NOT substitute a MORE-specific sibling when the base id is absent', () => {
    // The adversarial case: openai/gpt-5 isn't offered, only specialized
    // variants are. Picking gpt-5-codex/gpt-5-pro would be the WRONG model —
    // omitting (→ CLI default) is safer. Resolution must decline.
    const live = new Set(['openai/gpt-5-codex', 'openai/gpt-5-pro']);
    expect(resolveLiveModelId('openai/gpt-5', live)).toBe('openai/gpt-5');
  });

  it('does not match a partial token (gpt-5 must not resolve to gpt-50)', () => {
    expect(resolveLiveModelId('openai/gpt-5', new Set(['openai/gpt-50']))).toBe('openai/gpt-5');
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
