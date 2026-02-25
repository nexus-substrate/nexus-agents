/**
 * Tests for expert CLI routing helpers.
 *
 * (Source: Issue #858 — Multi-model task specialization Phase 3)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ROLE_TO_TASK_CATEGORY,
  resolveAdapterForModelPreference,
  resolveAdapterForRole,
} from './create-expert-routing.js';

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// ============================================================================
// ROLE_TO_TASK_CATEGORY mapping
// ============================================================================

describe('ROLE_TO_TASK_CATEGORY', () => {
  it('maps all 9 expert roles', () => {
    expect(Object.keys(ROLE_TO_TASK_CATEGORY)).toHaveLength(9);
  });

  it('maps code_expert to code_generation', () => {
    expect(ROLE_TO_TASK_CATEGORY['code_expert']).toBe('code_generation');
  });

  it('maps architecture_expert to architecture', () => {
    expect(ROLE_TO_TASK_CATEGORY['architecture_expert']).toBe('architecture');
  });

  it('maps security_expert to security_review', () => {
    expect(ROLE_TO_TASK_CATEGORY['security_expert']).toBe('security_review');
  });

  it('maps research_expert to research', () => {
    expect(ROLE_TO_TASK_CATEGORY['research_expert']).toBe('research');
  });

  it('maps documentation_expert to documentation', () => {
    expect(ROLE_TO_TASK_CATEGORY['documentation_expert']).toBe('documentation');
  });

  it('maps testing_expert to testing', () => {
    expect(ROLE_TO_TASK_CATEGORY['testing_expert']).toBe('testing');
  });

  it('maps devops_expert to devops', () => {
    expect(ROLE_TO_TASK_CATEGORY['devops_expert']).toBe('devops');
  });
});

// ============================================================================
// resolveAdapterForModelPreference
// ============================================================================

describe('resolveAdapterForModelPreference', () => {
  it('returns fallback for unknown model', () => {
    const fallback = { execute: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    const result = resolveAdapterForModelPreference('unknown', fallback as any, mockLogger as any);
    expect(result).toBe(fallback);
  });

  it('returns resilient adapter for known model', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    const result = resolveAdapterForModelPreference('claude-opus', undefined, mockLogger as any);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('complete');
    expect(result).toHaveProperty('stream');
  });

  it('matches by cliAlias', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    const result = resolveAdapterForModelPreference('opus', undefined, mockLogger as any);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('complete');
  });
});

// ============================================================================
// resolveAdapterForRole
// ============================================================================

describe('resolveAdapterForRole', () => {
  it('returns adapter for known role', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    const result = resolveAdapterForRole('code_expert', undefined, mockLogger as any);
    expect(result).toBeDefined();
  });

  it('returns fallback for unknown role', () => {
    const fallback = { execute: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    const result = resolveAdapterForRole('unknown_expert', fallback as any, mockLogger as any);
    expect(result).toBe(fallback);
  });

  it('logs auto-routing info for known role', () => {
    mockLogger.info.mockClear();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    resolveAdapterForRole('architecture_expert', undefined, mockLogger as any);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Auto-routing expert to specialized CLI',
      expect.objectContaining({
        role: 'architecture_expert',
        category: 'architecture',
        preferredCli: 'claude',
      })
    );
  });

  it('routes research_expert to gemini', () => {
    mockLogger.info.mockClear();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    resolveAdapterForRole('research_expert', undefined, mockLogger as any);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Auto-routing expert to specialized CLI',
      expect.objectContaining({ preferredCli: 'gemini' })
    );
  });

  it('routes code_expert to codex', () => {
    mockLogger.info.mockClear();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    resolveAdapterForRole('code_expert', undefined, mockLogger as any);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Auto-routing expert to specialized CLI',
      expect.objectContaining({ preferredCli: 'codex' })
    );
  });
});
