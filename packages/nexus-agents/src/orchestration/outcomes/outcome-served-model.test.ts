/**
 * Tests for the served-model outcome fields (#6624).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { servedOutcomeFields } from './outcome-served-model.js';
import { TaskOutcomeSchema } from './outcome-types.js';

describe('servedOutcomeFields (#6624)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('records the served model and its registry cost', () => {
    // claude-sonnet is $3 / $15 per 1M: 1000 in + 2000 out = 0.003 + 0.03.
    const fields = servedOutcomeFields({
      model: 'claude-sonnet',
      inputTokens: 1_000,
      outputTokens: 2_000,
    });
    expect(fields).toEqual({ servedModel: 'claude-sonnet', costUsd: 0.033, priceBasis: 'list' });
  });

  it('records an unpriced model as an unknown cost, never $0', () => {
    const fields = servedOutcomeFields({
      model: 'acme-unpriced-model-xyz',
      inputTokens: 500,
      outputTokens: 700,
    });
    expect(fields).toEqual({ servedModel: 'acme-unpriced-model-xyz', priceBasis: 'unknown' });
    expect('costUsd' in fields).toBe(false);
  });

  it('prices a gateway-served call by the gateway declaration, not the list rate', () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', 'priced:1,2');
    // $1 / $2 per 1M: 1000 in + 2000 out = 0.001 + 0.004. The list rate
    // for claude-sonnet would be 0.033.
    const fields = servedOutcomeFields({
      model: 'claude-sonnet',
      gatewayArm: 'api:custom-openai',
      inputTokens: 1_000,
      outputTokens: 2_000,
    });
    expect(fields).toEqual({ servedModel: 'claude-sonnet', costUsd: 0.005, priceBasis: 'list' });
  });

  it('records an undeclared gateway as an unknown cost', () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', undefined);
    const fields = servedOutcomeFields({
      model: 'claude-sonnet',
      gatewayArm: 'api:custom-openai',
      inputTokens: 1_000,
      outputTokens: 2_000,
    });
    expect(fields).toEqual({ servedModel: 'claude-sonnet', priceBasis: 'unknown' });
  });

  it('claims no price basis when the adapter reported no usage', () => {
    expect(servedOutcomeFields({ model: 'claude-sonnet' })).toEqual({
      servedModel: 'claude-sonnet',
    });
    expect(servedOutcomeFields({ model: 'claude-sonnet', inputTokens: 10 })).toEqual({
      servedModel: 'claude-sonnet',
    });
  });

  it('sets nothing when there is no served model', () => {
    expect(servedOutcomeFields(undefined)).toEqual({});
    expect(servedOutcomeFields({ model: undefined, inputTokens: 1, outputTokens: 1 })).toEqual({});
    expect(servedOutcomeFields({ model: '' })).toEqual({});
  });

  it('produces fields the outcome schema accepts, and legacy rows still parse', () => {
    const base = {
      id: 'o-1',
      cli: 'claude',
      category: 'planning',
      model: 'consensus',
      success: true,
      durationMs: 10,
      timestamp: '2026-09-23T00:00:00.000Z',
      source: 'consensus',
    } as const;
    const withServed = {
      ...base,
      ...servedOutcomeFields({ model: 'claude-sonnet', inputTokens: 1_000, outputTokens: 2_000 }),
    };
    expect(TaskOutcomeSchema.parse(withServed)).toEqual(withServed);
    expect(TaskOutcomeSchema.parse(base)).toEqual(base);
  });
});
