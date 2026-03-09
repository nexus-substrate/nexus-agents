import { describe, it, expect } from 'vitest';
import {
  getRoleCapability,
  buildToolRestrictionBlock,
  ROLE_CAPABILITIES,
} from './role-capabilities.js';

describe('getRoleCapability', () => {
  it('returns write tier for code role', () => {
    const cap = getRoleCapability('code');
    expect(cap.tier).toBe('write');
    expect(cap.allowedTools).toContain('Edit');
    expect(cap.allowedTools).toContain('Write');
  });

  it('returns read_only tier for architecture role', () => {
    const cap = getRoleCapability('architecture');
    expect(cap.tier).toBe('read_only');
    expect(cap.allowedTools).toContain('Read');
    expect(cap.allowedTools).not.toContain('Edit');
  });

  it('returns analysis tier for security role', () => {
    const cap = getRoleCapability('security');
    expect(cap.tier).toBe('analysis');
    expect(cap.allowedTools).toContain('Grep');
  });

  it('returns default analysis tier for unknown roles', () => {
    const cap = getRoleCapability('unknown_role');
    expect(cap.tier).toBe('analysis');
    expect(cap.restriction).toContain('Do NOT modify');
  });

  it('covers all 9 built-in expert roles', () => {
    const roles = [
      'code',
      'testing',
      'devops',
      'architecture',
      'security',
      'documentation',
      'research',
      'product',
      'ux',
    ];
    for (const role of roles) {
      expect(ROLE_CAPABILITIES[role]).toBeDefined();
    }
  });
});

describe('buildToolRestrictionBlock', () => {
  it('returns restriction block for read-only roles', () => {
    const block = buildToolRestrictionBlock('architecture');
    expect(block).toContain('## Tool Restrictions');
    expect(block).toContain('read-only');
    expect(block).toContain('Allowed tools:');
    expect(block).toContain('Read');
  });

  it('returns restriction block for analysis roles', () => {
    const block = buildToolRestrictionBlock('security');
    expect(block).toContain('Do NOT modify');
    expect(block).toContain('Grep');
  });

  it('returns restriction for write roles (still scoped)', () => {
    const block = buildToolRestrictionBlock('code');
    expect(block).toContain('## Tool Restrictions');
    expect(block).toContain('Edit');
  });

  it('returns restriction for unknown roles (default analysis)', () => {
    const block = buildToolRestrictionBlock('custom');
    expect(block).toContain('Do NOT modify');
  });

  it('lists all allowed tools', () => {
    const block = buildToolRestrictionBlock('research');
    expect(block).toContain('Read, Grep, Glob');
  });
});
