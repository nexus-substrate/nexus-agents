/**
 * Family ranking (#6604 review item 1; #6625 layers 1-2): tier first, then a
 * `-latest` alias, then `/models` `created` recency, with the id parsed only
 * as a fallback, and a date stamp in the id never beating a generation.
 */
import { describe, it, expect } from 'vitest';
import { rankFamilyModels, type RankableModel } from './gateway-family-ranking.js';

const ids = (list: readonly string[]): RankableModel[] => list.map((id) => ({ id }));

/** Every rotation of `list`: the ranking must not depend on the input order. */
function rotations<T>(list: readonly T[]): T[][] {
  return list.map((_, i) => [...list.slice(i), ...list.slice(0, i)]);
}

function expectRanked(models: readonly RankableModel[], expected: readonly string[]): void {
  for (const order of [...rotations(models), ...rotations([...models].reverse())]) {
    expect(rankFamilyModels(order)).toEqual(expected);
  }
}

describe('rankFamilyModels', () => {
  it('ranks a dated Bedrock catalogue by tier and generation, not the date stamp', () => {
    expectRanked(
      ids([
        'anthropic.claude-3-haiku-20240307-v1:0',
        'anthropic.claude-opus-4-6-v1:0',
        'anthropic.claude-sonnet-4-5-20250929-v1:0',
      ]),
      [
        'anthropic.claude-opus-4-6-v1:0',
        'anthropic.claude-sonnet-4-5-20250929-v1:0',
        'anthropic.claude-3-haiku-20240307-v1:0',
      ]
    );
  });

  it('ranks the id-only fallback by generation, never by the date stamp', () => {
    // Same tier, so only the generation separates them: 4-6 beats 3 even
    // though 20240307 is a larger number than 4.
    expectRanked(ids(['claude-3-opus-20240229', 'claude-opus-4-6']), [
      'claude-opus-4-6',
      'claude-3-opus-20240229',
    ]);
  });

  it('puts a flagship of any generation above a newer mid-tier model', () => {
    expectRanked(
      ids([
        'claude-3-7-sonnet-20250219',
        'claude-sonnet-4-20250514',
        'claude-opus-4-1-20250805',
        'claude-3-5-haiku-20241022',
      ]),
      [
        'claude-opus-4-1-20250805',
        'claude-sonnet-4-20250514',
        'claude-3-7-sonnet-20250219',
        'claude-3-5-haiku-20241022',
      ]
    );
  });

  it('reads dot and dash version spellings alike', () => {
    expectRanked(ids(['claude-sonnet-4-5', 'claude-sonnet-4.6']), [
      'claude-sonnet-4.6',
      'claude-sonnet-4-5',
    ]);
  });

  it('scores a dot spelling through its dash respelling in the registry', () => {
    // Same tier and generation; only the registry score separates them, and
    // `claude-sonnet-4.6` is scored only under `claude-sonnet-4-6`.
    expectRanked(ids(['claude-sonnet-4-6-preview', 'claude-sonnet-4.6']), [
      'claude-sonnet-4.6',
      'claude-sonnet-4-6-preview',
    ]);
  });

  it('places the o-series between gpt-4.x and gpt-5, with minis mid tier', () => {
    expectRanked(ids(['gpt-4o', 'gpt-4.1', 'o3', 'o4-mini', 'gpt-4o-mini', 'o1']), [
      'o3',
      'o1',
      'gpt-4.1',
      'gpt-4o',
      'o4-mini',
      'gpt-4o-mini',
    ]);
    expect(rankFamilyModels(ids(['o3', 'gpt-4.1', 'gpt-5.5']))[0]).toBe('gpt-5.5');
  });

  it('uses /models created stamps for recency within a tier', () => {
    // The id alone would rank gpt-5.6 first; the metadata says gpt-5.5-pro is newer.
    expectRanked(
      [
        { id: 'gpt-5.6', created: 1_700_000_000 },
        { id: 'gpt-5.5-pro', created: 1_800_000_000 },
      ],
      ['gpt-5.5-pro', 'gpt-5.6']
    );
  });

  it('never lets a newer mini beat an older flagship', () => {
    expectRanked(
      [
        { id: 'gpt-5.6-mini', created: 1_900_000_000 },
        { id: 'gpt-5.5', created: 1_700_000_000 },
      ],
      ['gpt-5.5', 'gpt-5.6-mini']
    );
  });

  it('falls back to the id when some models carry no created stamp', () => {
    // Comparing `created` only where both have one would cycle here (4-1 over
    // 4-8 by stamp, 4-8 over 4-6 and 4-6 over 4-1 by id), and the result would
    // depend on the input order.
    expectRanked(
      [
        { id: 'claude-opus-4-1', created: 1_900_000_000 },
        { id: 'claude-opus-4-6' },
        { id: 'claude-opus-4-8', created: 1_800_000_000 },
      ],
      ['claude-opus-4-8', 'claude-opus-4-6', 'claude-opus-4-1']
    );
  });

  it("prefers a vendor '-latest' alias within its tier", () => {
    expectRanked(ids(['claude-opus-4-6', 'claude-3-opus-latest', 'claude-3-5-sonnet-latest']), [
      'claude-3-opus-latest',
      'claude-opus-4-6',
      'claude-3-5-sonnet-latest',
    ]);
  });

  it('ranks gemini pro over flash over flash-lite', () => {
    expectRanked(ids(['gemini-3-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro']), [
      'gemini-2.5-pro',
      'gemini-3-flash',
      'gemini-2.5-flash-lite',
    ]);
  });

  it('breaks a full tie on the id date, then the id', () => {
    expectRanked(ids(['claude-opus-4-1', 'claude-opus-4-1-20250805']), [
      'claude-opus-4-1-20250805',
      'claude-opus-4-1',
    ]);
  });

  it('is empty for an empty family', () => {
    expect(rankFamilyModels([])).toEqual([]);
  });
});
