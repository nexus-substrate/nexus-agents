/**
 * Tests for the protected-path / self-modification guard (#3653 condition 2).
 */

import { describe, it, expect } from 'vitest';
import { isProtectedPath, planTouchesProtectedPath } from './remediation-protected-paths.js';
import type { RemediationPlan } from './improvement-remediation-capability.js';

describe('isProtectedPath', () => {
  it('protects the loop’s own safety rails', () => {
    expect(
      isProtectedPath('packages/nexus-agents/src/mcp/tools/improvement-remediation-enforce.ts')
    ).toBe(true);
    expect(isProtectedPath('src/mcp/tools/remediation-circuit-breaker.ts')).toBe(true);
    expect(isProtectedPath('src/mcp/tools/auto-remediation-lease.ts')).toBe(true);
    expect(isProtectedPath('src/mcp/tools/improvement-review.ts')).toBe(true);
  });

  it('protects consensus/voter config, governance, CI, security/auth/secrets', () => {
    expect(isProtectedPath('packages/nexus-agents/src/consensus/engine.ts')).toBe(true);
    expect(isProtectedPath('.rules/untrusted-input.md')).toBe(true);
    expect(isProtectedPath('.github/workflows/ci.yml')).toBe(true);
    expect(isProtectedPath('src/security/access-constraint-deriver/index.ts')).toBe(true);
    expect(isProtectedPath('src/scm/token-resolver.ts')).toBe(true);
    expect(isProtectedPath('CODEOWNERS')).toBe(true);
    expect(isProtectedPath('CLAUDE.md')).toBe(true);
  });

  it('allows ordinary source paths', () => {
    expect(isProtectedPath('packages/nexus-agents/src/cli/weather.ts')).toBe(false);
    expect(isProtectedPath('docs/README.md')).toBe(false);
    expect(isProtectedPath('src/pipeline/templates.ts')).toBe(false);
  });

  it('matches regardless of slashes / case / leading ./', () => {
    expect(isProtectedPath('.\\src\\consensus\\Engine.ts')).toBe(true);
    expect(isProtectedPath('./.RULES/Security.md'.replace('RULES', 'rules'))).toBe(true);
  });
});

describe('planTouchesProtectedPath', () => {
  function plan(targets: (string | undefined)[]): RemediationPlan {
    return {
      signalKey: 'k',
      category: 'tech-debt',
      summary: 's',
      steps: targets.map((t) => ({
        kind: 'refactor' as const,
        description: 'x',
        ...(t !== undefined ? { targetPath: t } : {}),
      })),
    };
  }

  it('flags a plan that targets a protected path', () => {
    const r = planTouchesProtectedPath(plan(['src/x.ts', 'src/consensus/engine.ts']));
    expect(r.protected).toBe(true);
    expect(r.paths).toEqual(['src/consensus/engine.ts']);
  });

  it('passes a plan with only ordinary targets', () => {
    expect(planTouchesProtectedPath(plan(['src/cli/x.ts', undefined])).protected).toBe(false);
  });
});
