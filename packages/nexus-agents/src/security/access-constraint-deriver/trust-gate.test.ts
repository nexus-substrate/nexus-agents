/**
 * Tests for the trust-tier gate (#1977 condition 4).
 */

import { describe, it, expect } from 'vitest';
import { gateTrust } from './index.js';

describe('gateTrust', () => {
  it('allows LLM derivation for Tier 1 (authoritative)', () => {
    const d = gateTrust('1');
    expect(d.allow).toBe('llm');
  });

  it('allows LLM derivation for Tier 2 (semi-trusted)', () => {
    const d = gateTrust('2');
    expect(d.allow).toBe('llm');
  });

  it('refuses LLM for Tier 3 (untrusted)', () => {
    const d = gateTrust('3');
    expect(d.allow).toBe('fallback-only');
    if (d.allow === 'fallback-only') {
      expect(d.reason).toMatch(/untrusted/);
    }
  });

  it('refuses LLM for Tier 4 (hostile)', () => {
    const d = gateTrust('4');
    expect(d.allow).toBe('fallback-only');
    if (d.allow === 'fallback-only') {
      expect(d.reason).toMatch(/hostile/);
    }
  });

  it('safe-defaults to fallback on missing tier', () => {
    const d = gateTrust(undefined);
    expect(d.allow).toBe('fallback-only');
    if (d.allow === 'fallback-only') {
      expect(d.reason).toMatch(/unknown/);
    }
  });
});
