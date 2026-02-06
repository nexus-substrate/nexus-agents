/**
 * Tests for consensus/helpers.ts
 *
 * Covers generateProposalId.
 */

import { describe, it, expect } from 'vitest';
import { generateProposalId } from './helpers.js';

describe('generateProposalId', () => {
  it('starts with "prop_" prefix', () => {
    const id = generateProposalId();
    expect(id.startsWith('prop_')).toBe(true);
  });

  it('contains two underscore-separated parts after prefix', () => {
    const id = generateProposalId();
    const parts = id.split('_');
    // prop + timestamp + random = 3 parts
    expect(parts.length).toBe(3);
  });

  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateProposalId());
    }
    expect(ids.size).toBe(100);
  });

  it('has reasonable length', () => {
    const id = generateProposalId();
    // prop_ (5) + timestamp (8-10) + _ (1) + random (6) = ~20-22
    expect(id.length).toBeGreaterThan(10);
    expect(id.length).toBeLessThan(40);
  });
});
