/**
 * Tests for Consensus Result Builder
 * @module consensus/result-builder.test
 */

import { describe, it, expect } from 'vitest';
import { determineFinalStatus } from './result-builder.js';

// ============================================================================
// determineFinalStatus
// ============================================================================

describe('determineFinalStatus', () => {
  it('returns approved when quorum reached and approved', () => {
    expect(determineFinalStatus(true, true)).toBe('approved');
  });

  it('returns rejected when quorum not reached', () => {
    expect(determineFinalStatus(false, true)).toBe('rejected');
  });

  it('returns rejected when not approved', () => {
    expect(determineFinalStatus(true, false)).toBe('rejected');
  });

  it('returns rejected when both false', () => {
    expect(determineFinalStatus(false, false)).toBe('rejected');
  });
});
