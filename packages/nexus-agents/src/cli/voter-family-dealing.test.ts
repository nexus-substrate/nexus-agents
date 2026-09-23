/**
 * Family-first seat dealing for gateway panels (#6606).
 */
import { describe, expect, it } from 'vitest';

import { THREE_FAMILY_CHAT_IDS } from '../testing/gateway/three-family-catalog.js';
import { dealSeatsAcrossFamilies, vendorFamilyOf } from './voter-family-dealing.js';

interface Model {
  readonly modelId: string;
}

const models = (ids: readonly string[]): Model[] => ids.map((modelId) => ({ modelId }));
const ids = (seats: readonly Model[]): string[] => seats.map((s) => s.modelId);

describe('vendorFamilyOf (#6606)', () => {
  it('classifies gateway-decorated ids by vendor, and unrecognised ids as unknown', () => {
    expect(vendorFamilyOf('anthropic.claude-sonnet-4-5-20250929-v1:0')).toBe('anthropic');
    expect(vendorFamilyOf('openai/o3')).toBe('openai');
    expect(vendorFamilyOf('vertex_ai/gemini-2.5-pro')).toBe('google');
    expect(vendorFamilyOf('mystery-model')).toBe('unknown');
  });
});

describe('dealSeatsAcrossFamilies (#6606)', () => {
  it('seats seven voters on all three families of the recorded catalogue', () => {
    const seats = dealSeatsAcrossFamilies(7, models(THREE_FAMILY_CHAT_IDS));
    const families = ids(seats).map(vendorFamilyOf);
    expect(families.filter((f) => f === 'anthropic')).toHaveLength(3);
    expect(families.filter((f) => f === 'openai')).toHaveLength(2);
    expect(families.filter((f) => f === 'google')).toHaveLength(2);
    // Seven seats over twelve models: no model is seated twice.
    expect(new Set(ids(seats)).size).toBe(7);
  });

  it('deals identically whatever order the gateway lists its models in', () => {
    const listed = ids(dealSeatsAcrossFamilies(7, models(THREE_FAMILY_CHAT_IDS)));
    const reversed = ids(dealSeatsAcrossFamilies(7, models([...THREE_FAMILY_CHAT_IDS].reverse())));
    const rotated = [...THREE_FAMILY_CHAT_IDS.slice(5), ...THREE_FAMILY_CHAT_IDS.slice(0, 5)];
    expect(reversed).toEqual(listed);
    expect(ids(dealSeatsAcrossFamilies(7, models(rotated)))).toEqual(listed);
  });

  it('keeps a one-family catalogue on one family, spread across its models', () => {
    const seats = dealSeatsAcrossFamilies(4, models(['gpt-5.2', 'openai/o3', 'openai/gpt-4o']));
    expect(new Set(ids(seats).map(vendorFamilyOf))).toEqual(new Set(['openai']));
    expect(new Set(ids(seats)).size).toBe(3);
  });

  it('balances around seats already taken by pins', () => {
    // Two pinned Anthropic seats: the next three seats go to the other families first.
    const seats = dealSeatsAcrossFamilies(3, models(THREE_FAMILY_CHAT_IDS), {
      seated: ['claude_4_5_opus', 'claude-opus-4-1-20250805'],
    });
    // Counts start at anthropic 2, openai 0, google 0; ties go to the fixed family order.
    expect(ids(seats).map(vendorFamilyOf)).toEqual(['openai', 'google', 'openai']);
  });

  it('prefers a model no pin already holds within the chosen family', () => {
    const seats = dealSeatsAcrossFamilies(1, models(['claude_4_5_opus', 'claude-sonnet-4-6']), {
      seated: ['claude_4_5_opus'],
    });
    expect(ids(seats)).toEqual(['claude-sonnet-4-6']);
  });

  it('deals unknown-vendor models last, as their own group', () => {
    const seats = dealSeatsAcrossFamilies(
      4,
      models(['mystery-model', 'gpt-5.2', 'claude_4_5_opus', 'gemini-3-pro-preview'])
    );
    expect(ids(seats)).toEqual([
      'claude_4_5_opus',
      'gpt-5.2',
      'gemini-3-pro-preview',
      'mystery-model',
    ]);
  });

  it('seats a known family before an unknown one when seats run short', () => {
    const seats = dealSeatsAcrossFamilies(1, models(['mystery-model', 'gpt-5.2']));
    expect(ids(seats)).toEqual(['gpt-5.2']);
  });

  it('orders models within a family by the injected ranking seam', () => {
    const seats = dealSeatsAcrossFamilies(2, models(['gpt-5.2', 'openai/o3', 'openai/gpt-4o']), {
      rankWithinFamily: (list) => [...list].sort().reverse(),
    });
    expect(ids(seats)).toEqual(['openai/o3', 'openai/gpt-4o']);
  });

  it('names the empty cases: no seats or no models deal nothing', () => {
    expect(dealSeatsAcrossFamilies(0, models(['gpt-5.2']))).toEqual([]);
    expect(dealSeatsAcrossFamilies(3, [])).toEqual([]);
  });
});
