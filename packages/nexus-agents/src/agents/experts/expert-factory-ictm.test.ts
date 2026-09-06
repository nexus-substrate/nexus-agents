/**
 * Tests for createFromICTM in expert-factory.ts
 *
 * @see Issue #756 Phase 2
 */

import { describe, it, expect } from 'vitest';
import type { ICTMConfig } from '../ictm/ictm-types.js';
import { createFromICTM, ExpertFactory } from './expert-factory.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeICTM(overrides: Partial<ICTMConfig> = {}) {
  return {
    instructions: 'Analyze the authentication module for security issues.',
    context: {
      maxTokens: 8000,
      relevanceThreshold: 0.5,
      includeHistory: false,
      pruneStrategy: 'importance' as const,
    },
    tools: { capabilities: ['code_review', 'research'] },
    model: { temperature: 0.3, maxTokens: 4096, reasoning: 'standard' as const },
    ...overrides,
  };
}

describe('createFromICTM', () => {
  it('creates an Expert from valid ICTM config', () => {
    const result = createFromICTM(makeICTM(), 'sub-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeDefined();
  });

  it('expert has role custom', () => {
    const result = createFromICTM(makeICTM(), 'sub-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expertConfig.role).toBe('custom');
  });

  it('expert id includes subtask id', () => {
    const result = createFromICTM(makeICTM(), 'my-task');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expertConfig.id).toBe('ictm-my-task');
  });

  it('expert name includes subtask id', () => {
    const result = createFromICTM(makeICTM(), 'abc');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expertConfig.name).toBe('ICTM Agent (abc)');
  });

  it('expert systemPrompt matches ICTM instructions', () => {
    const ictm = makeICTM({ instructions: 'Review the API layer.' });
    const result = createFromICTM(ictm, 'sub-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expertConfig.systemPrompt).toBe('Review the API layer.');
  });

  it('expert capabilities match ICTM tools', () => {
    const ictm = makeICTM({ tools: { capabilities: ['task_execution', 'tool_use'] } });
    const result = createFromICTM(ictm, 'sub-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expertConfig.capabilities).toEqual(['task_execution', 'tool_use']);
  });

  it('expert modelPreference.temperature matches ICTM', () => {
    const ictm = makeICTM({ model: { temperature: 0.1, maxTokens: 2048, reasoning: 'extended' } });
    const result = createFromICTM(ictm, 'sub-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expertConfig.modelPreference?.temperature).toBe(0.1);
  });

  it('expert modelPreference.maxTokens matches ICTM', () => {
    const ictm = makeICTM({ model: { temperature: 0.3, maxTokens: 8192, reasoning: 'standard' } });
    const result = createFromICTM(ictm, 'sub-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expertConfig.modelPreference?.maxTokens).toBe(8192);
  });

  it('expert metadata includes ictm: true', () => {
    const result = createFromICTM(makeICTM(), 'sub-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expertConfig.metadata?.ictm).toBe(true);
  });

  it('expert metadata includes contextFilter', () => {
    const ictm = makeICTM();
    const result = createFromICTM(ictm, 'sub-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = result.value.expertConfig.metadata;
    expect(meta?.contextFilter).toEqual(ictm.context);
  });

  it('expert metadata includes reasoningDepth', () => {
    const ictm = makeICTM({ model: { temperature: 0.1, maxTokens: 8192, reasoning: 'extended' } });
    const result = createFromICTM(ictm, 'sub-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expertConfig.metadata?.reasoningDepth).toBe('extended');
  });

  it('ExpertFactory.createFromICTM also works', () => {
    const result = ExpertFactory.createFromICTM(makeICTM(), 'sub-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expertConfig.id).toBe('ictm-sub-1');
  });

  it('propagates provider and modelId when present', () => {
    const ictm = makeICTM({
      model: {
        temperature: 0.3,
        maxTokens: 4096,
        reasoning: 'standard',
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-6',
      },
    });
    const result = createFromICTM(ictm, 'sub-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expertConfig.modelPreference?.provider).toBe('anthropic');
    expect(result.value.expertConfig.modelPreference?.modelId).toBe('claude-sonnet-4-6');
  });
});
