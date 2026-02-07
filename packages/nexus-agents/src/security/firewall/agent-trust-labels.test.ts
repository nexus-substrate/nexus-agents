import { describe, expect, it } from 'vitest';

import type { ATLData } from './firewall-types.js';
import { generateATL, parseATL } from './agent-trust-labels.js';

describe('generateATL', () => {
  it('generates a valid ATL string without rep', () => {
    const atl = generateATL({
      tier: '3',
      source: 'github-comment',
      user: 'octocat',
      sanitized: true,
    });
    expect(atl).toBe('[ATL:tier=3,source=github-comment,user=octocat,sanitized=true]');
  });

  it('includes rep when provided', () => {
    const atl = generateATL({
      tier: '2',
      source: 'github-issue',
      user: 'alice',
      sanitized: false,
      rep: 0.75,
    });
    expect(atl).toBe('[ATL:tier=2,source=github-issue,user=alice,sanitized=false,rep=0.75]');
  });

  it('encodes special characters in values', () => {
    const atl = generateATL({
      tier: '1',
      source: 'test,source',
      user: 'user=1',
      sanitized: true,
    });
    expect(atl).toContain('source=test%2Csource');
    expect(atl).toContain('user=user%3D1');
  });

  it('formats rep to 2 decimal places', () => {
    const atl = generateATL({
      tier: '4',
      source: 'x',
      user: 'y',
      sanitized: true,
      rep: 0.333333,
    });
    expect(atl).toContain('rep=0.33');
  });

  it('throws for invalid tier', () => {
    expect(() =>
      generateATL({
        tier: '5' as ATLData['tier'],
        source: 'x',
        user: 'y',
        sanitized: true,
      })
    ).toThrow();
  });
});

describe('parseATL', () => {
  it('roundtrips a basic ATL', () => {
    const data: ATLData = {
      tier: '3',
      source: 'github-comment',
      user: 'octocat',
      sanitized: true,
    };
    const atl = generateATL(data);
    const parsed = parseATL(atl);
    expect(parsed).toEqual(data);
  });

  it('roundtrips ATL with rep', () => {
    const data: ATLData = {
      tier: '2',
      source: 'github-issue',
      user: 'alice',
      sanitized: false,
      rep: 0.75,
    };
    const atl = generateATL(data);
    const parsed = parseATL(atl);
    expect(parsed).toEqual(data);
  });

  it('roundtrips ATL with encoded characters', () => {
    const data: ATLData = {
      tier: '1',
      source: 'test,source',
      user: 'user=1',
      sanitized: true,
    };
    const atl = generateATL(data);
    const parsed = parseATL(atl);
    expect(parsed).toEqual(data);
  });

  it('returns undefined for non-ATL strings', () => {
    expect(parseATL('hello world')).toBeUndefined();
    expect(parseATL('')).toBeUndefined();
    expect(parseATL('[ATL:]')).toBeUndefined();
  });

  it('returns undefined for missing required fields', () => {
    expect(parseATL('[ATL:tier=3,source=x]')).toBeUndefined();
  });

  it('returns undefined for malformed pairs', () => {
    expect(parseATL('[ATL:no-equals-sign]')).toBeUndefined();
  });

  it('returns undefined for invalid tier in parsed data', () => {
    const atl = '[ATL:tier=9,source=x,user=y,sanitized=true]';
    expect(parseATL(atl)).toBeUndefined();
  });

  it('trims whitespace around the ATL string', () => {
    const data: ATLData = {
      tier: '3',
      source: 'github-issue',
      user: 'bob',
      sanitized: true,
    };
    const atl = `  ${generateATL(data)}  `;
    expect(parseATL(atl)).toEqual(data);
  });
});
