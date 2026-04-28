/**
 * Tests for the `confirm_risky` access-policy mode (#2279).
 *
 * Mode-specific behavior of `checkAccess()`:
 *
 * - Read-only tool not in policy → `log-and-allow` (same as audit)
 * - Risky tool not in policy → `deny` with structured "would-have-required-
 *   approval" reason
 * - Tool in policy → `allow` regardless of risk classification
 * - Unbypassable denylist still wins over confirm_risky (verified for both
 *   tool-denylist and path-denylist)
 *
 * @module security/access-constraint-deriver/enforcer-confirm-risky.test
 */

import { describe, it, expect } from 'vitest';
import { checkAccess } from './enforcer.js';
import { isRiskyTool, READ_ONLY_TOOLS } from './tool-risk.js';
import type { TaskAccessPolicy } from './types.js';

function makePolicy(overrides: Partial<TaskAccessPolicy> = {}): TaskAccessPolicy {
  return {
    allowedTools: ['list_experts'],
    allowedPathPatterns: [],
    allowedOperations: '*',
    objectiveHash: 'test-hash',
    derivedAt: '2026-04-28T00:00:00Z',
    source: 'llm',
    mode: 'confirm_risky',
    ...overrides,
  };
}

describe('isRiskyTool', () => {
  it('classifies known read-only tools as not risky', () => {
    expect(isRiskyTool('research_query')).toBe(false);
    expect(isRiskyTool('memory_query')).toBe(false);
    expect(isRiskyTool('weather_report')).toBe(false);
    expect(isRiskyTool('search_codebase')).toBe(false);
  });

  it('classifies known mutating tools as risky', () => {
    expect(isRiskyTool('orchestrate')).toBe(true);
    expect(isRiskyTool('memory_write')).toBe(true);
    expect(isRiskyTool('research_add')).toBe(true);
    expect(isRiskyTool('issue_triage')).toBe(true);
    expect(isRiskyTool('pr_review')).toBe(true);
  });

  it('defaults unknown tools to risky (fail-closed)', () => {
    expect(isRiskyTool('totally_made_up_tool')).toBe(true);
    expect(isRiskyTool('')).toBe(true);
  });

  it('exports a stable READ_ONLY_TOOLS set', () => {
    expect(READ_ONLY_TOOLS.size).toBeGreaterThan(10);
    expect(READ_ONLY_TOOLS.has('research_query')).toBe(true);
  });
});

describe('checkAccess: confirm_risky mode', () => {
  it('allows tools in the allowedTools list regardless of risk', () => {
    const policy = makePolicy({ allowedTools: ['orchestrate'] }); // risky tool, allowed
    const decision = checkAccess('orchestrate', policy);
    expect(decision.decision).toBe('allow');
  });

  it('log-and-allows read-only tools NOT in allowedTools', () => {
    const policy = makePolicy({ allowedTools: ['list_experts'] });
    const decision = checkAccess('research_query', policy);
    expect(decision.decision).toBe('log-and-allow');
    if (decision.decision === 'log-and-allow') {
      expect(decision.warning).toContain('confirm_risky');
      expect(decision.warning).toContain('read-only');
    }
  });

  it('denies risky tools NOT in allowedTools with a structured reason', () => {
    const policy = makePolicy({ allowedTools: ['list_experts'] });
    const decision = checkAccess('orchestrate', policy);
    expect(decision.decision).toBe('deny');
    if (decision.decision === 'deny') {
      expect(decision.matchedRule).toBe('allowedTools:confirm_risky');
      expect(decision.reason).toContain('would have required human approval');
    }
  });

  it('denies unknown tools (fail-closed default)', () => {
    const policy = makePolicy({ allowedTools: ['list_experts'] });
    const decision = checkAccess('unknown_tool', policy);
    expect(decision.decision).toBe('deny');
  });

  it('respects the unbypassable tool denylist even in confirm_risky mode', () => {
    const policy = makePolicy({ allowedTools: '*' }); // wildcard would normally allow
    // git_push_force is on UNBYPASSABLE_TOOL_NAMES — must be denied even with wildcard policy
    const decision = checkAccess('git_push_force', policy);
    expect(decision.decision).toBe('deny');
    if (decision.decision === 'deny') {
      expect(decision.matchedRule).toBe('unbypassable:tool');
    }
  });

  it('respects the unbypassable path denylist even in confirm_risky mode', () => {
    const policy = makePolicy({ allowedTools: '*' });
    const decision = checkAccess('research_query', policy, { path: '/etc/shadow' });
    expect(decision.decision).toBe('deny');
    if (decision.decision === 'deny') {
      expect(decision.matchedRule).toBe('unbypassable:path');
    }
  });

  it('wildcard allowedTools still allows everything in confirm_risky', () => {
    const policy = makePolicy({ allowedTools: '*' });
    const decision = checkAccess('orchestrate', policy);
    expect(decision.decision).toBe('allow');
  });
});

describe('checkAccess: mode comparison for graduation path', () => {
  const cases: { mode: TaskAccessPolicy['mode']; expected: 'allow' | 'log-and-allow' | 'deny' }[] =
    [
      { mode: 'audit', expected: 'log-and-allow' },
      { mode: 'confirm_risky', expected: 'log-and-allow' }, // research_query is read-only
      { mode: 'enforce', expected: 'deny' },
    ];

  it.each(cases)(
    'read-only tool not in policy under $mode mode → $expected',
    ({ mode, expected }) => {
      const policy = makePolicy({ mode, allowedTools: ['list_experts'] });
      const decision = checkAccess('research_query', policy);
      expect(decision.decision).toBe(expected);
    }
  );

  const riskyCases: {
    mode: TaskAccessPolicy['mode'];
    expected: 'allow' | 'log-and-allow' | 'deny';
  }[] = [
    { mode: 'audit', expected: 'log-and-allow' },
    { mode: 'confirm_risky', expected: 'deny' }, // risky → blocked
    { mode: 'enforce', expected: 'deny' },
  ];

  it.each(riskyCases)(
    'risky tool not in policy under $mode mode → $expected',
    ({ mode, expected }) => {
      const policy = makePolicy({ mode, allowedTools: ['list_experts'] });
      const decision = checkAccess('orchestrate', policy);
      expect(decision.decision).toBe(expected);
    }
  );
});
