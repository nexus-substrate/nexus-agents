import { describe, it, expect } from 'vitest';
import { resolveConsensusEnforcementMode } from './consensus-enforcement-mode.js';

describe('resolveConsensusEnforcementMode', () => {
  it.each(['off', 'audit', 'enforce'] as const)('accepts %s', (mode) => {
    expect(resolveConsensusEnforcementMode(mode)).toBe(mode);
  });
  it.each([undefined, '', 'invalid', 'ENFORCE'])('defaults %s to audit', (raw) => {
    expect(resolveConsensusEnforcementMode(raw)).toBe('audit');
  });
});
