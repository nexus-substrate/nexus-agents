/**
 * Tests for the ClawGuard access-policy opt-in in orchestrate (#2022).
 *
 * Verifies that:
 * - When NEXUS_ACCESS_POLICY_MODE is unset, defaults to 'audit' mode.
 *   When explicitly set to 'off', the derived policy is bypass/off and
 *   the middleware short-circuits.
 * - When mode is 'audit', a policy is derived with the configured mode
 *   and the orchestrator.execute call observes it in ALS.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  deriveAccessPolicy,
  getActivePolicy,
  resolveAccessPolicyMode,
  resetPolicyCache,
  withAccessPolicy,
} from '../../security/access-constraint-deriver/index.js';

describe('orchestrate access-policy opt-in (#2022)', () => {
  beforeEach(() => {
    resetPolicyCache();
    delete process.env['NEXUS_ACCESS_POLICY_MODE'];
  });

  afterEach(() => {
    delete process.env['NEXUS_ACCESS_POLICY_MODE'];
    resetPolicyCache();
  });

  it('defaults to audit mode when env var unset (v2.50+)', () => {
    expect(resolveAccessPolicyMode()).toBe('audit');
  });

  it('derives bypass policy in off mode (no behavior change)', async () => {
    const policy = await deriveAccessPolicy('explore src/', { mode: 'off' });
    expect(policy.mode).toBe('off');
    expect(policy.source).toBe('bypass');
    expect(policy.allowedTools).toBe('*');
  });

  it('derives fallback-keyword policy in audit mode without adapter', async () => {
    const policy = await deriveAccessPolicy('explore src/', {
      mode: 'audit',
      trustTier: '1',
    });
    expect(policy.mode).toBe('audit');
    // No adapter → regex fallback; source is fallback-keyword.
    expect(policy.source).toBe('fallback-keyword');
  });

  it('withAccessPolicy surfaces the policy to nested code via ALS', async () => {
    const policy = await deriveAccessPolicy('read the README', { mode: 'audit' });

    let observed = getActivePolicy();
    expect(observed).toBeUndefined();

    await withAccessPolicy(policy, () => {
      observed = getActivePolicy();
      return Promise.resolve();
    });
    expect(observed?.mode).toBe('audit');
    expect(observed?.source).toBe('fallback-keyword');
  });

  it('honors env var override', () => {
    process.env['NEXUS_ACCESS_POLICY_MODE'] = 'off';
    expect(resolveAccessPolicyMode()).toBe('off');

    process.env['NEXUS_ACCESS_POLICY_MODE'] = 'enforce';
    expect(resolveAccessPolicyMode()).toBe('enforce');

    // Invalid values silently fall through to the default (audit).
    process.env['NEXUS_ACCESS_POLICY_MODE'] = 'invalid';
    expect(resolveAccessPolicyMode()).toBe('audit');
  });
});
