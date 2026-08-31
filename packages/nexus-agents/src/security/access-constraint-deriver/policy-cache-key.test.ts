/**
 * A derived access policy must not cross a trust boundary via the cache.
 *
 * The cache was keyed on `hashObjective(userObjective)` ALONE — neither
 * `trustTier` nor `mode` was part of the key — and `getPolicyCache()` is a
 * process-wide singleton, so one long-lived MCP server shares it across every
 * tool call.
 *
 * That matters because BOTH production callers pass `trustTier` explicitly and
 * thread it from the request context:
 *
 *   execute-expert.ts:393   deriveAccessPolicy(objective, { mode, trustTier: trustTier ?? '4' })
 *   orchestrate.ts:910      deriveAccessPolicy(taskText,  { mode, trustTier: trustTier ?? '4' })
 *
 * So two calls with the SAME objective text and DIFFERENT trust tiers really do
 * occur in one process. The cache hit at `deriver.ts:80` returns before any
 * trust or mode branch, so an untrusted caller could receive a policy derived
 * for a trusted one — while telemetry recorded `trustDecision: 'cache-hit'`,
 * making the tier-4 derivation look as though it had happened.
 *
 * The `mode` dimension is the same defect and less reachable: both callers
 * resolve `mode` from the same env, so it would take an explicit differing
 * `opts.mode` in one process. It is keyed anyway — `buildBypassPolicy` stores
 * `allowedTools: '*'` under this key in `off` mode, and `enforcer.ts:69`
 * short-circuits `if (policy.allowedTools === '*') return { decision: 'allow' }`.
 *
 * @module security/access-constraint-deriver/policy-cache-key.test
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { deriveAccessPolicy, deriveWithTelemetry } from './deriver.js';
import { resetPolicyCache } from './cache.js';

const OBJECTIVE = 'refactor the billing module and update its tests';

beforeEach(() => {
  resetPolicyCache();
});

describe('policy cache is keyed by trust boundary, not objective alone', () => {
  it('does not serve a tier-1 policy to a tier-4 caller', async () => {
    // The dangerous direction. Run 1 is trusted; run 2 is not, and must derive
    // its own policy rather than inherit the trusted caller's.
    //
    // Asserted on `telemetry.trustDecision`, not on a policy field: an earlier
    // draft of this test compared `policy.trustTier`, which does not exist on
    // `TaskAccessPolicy` — so it compared `undefined ?? '4'` against
    // `undefined ?? '1'` and passed no matter what the cache did. The telemetry
    // is the direct observable: `'cache-hit'` is set precisely on the early
    // return this fix is about.
    await deriveWithTelemetry(OBJECTIVE, { mode: 'audit', trustTier: '1' });
    const second = await deriveWithTelemetry(OBJECTIVE, { mode: 'audit', trustTier: '4' });

    expect(second.telemetry.trustDecision).not.toBe('cache-hit');
  });

  it('does not serve an off-mode bypass policy to an enforce-mode caller', async () => {
    // `off` stores `allowedTools: '*'`, and the enforcer treats that as
    // allow-everything. A later enforce-mode call must not inherit it.
    const off = await deriveAccessPolicy(OBJECTIVE, { mode: 'off', trustTier: '4' });
    expect(off.allowedTools).toBe('*');

    const enforced = await deriveAccessPolicy(OBJECTIVE, { mode: 'enforce', trustTier: '4' });
    expect(enforced.allowedTools).not.toBe('*');
  });

  it('still caches when objective, mode and tier all match', async () => {
    // The control. A key that never hits would satisfy both tests above and
    // turn every derivation into a fresh LLM call — the cache exists for a
    // reason, and this proves the fix narrowed it rather than disabled it.
    await deriveWithTelemetry(OBJECTIVE, { mode: 'audit', trustTier: '4' });
    const second = await deriveWithTelemetry(OBJECTIVE, { mode: 'audit', trustTier: '4' });

    expect(second.telemetry.trustDecision).toBe('cache-hit');
  });

  it('keeps objectiveHash as the hash of the objective alone', async () => {
    // The cache key gains dimensions; the AUDIT field must not. `objectiveHash`
    // is provenance — it answers "which objective produced this policy" — and
    // folding mode or tier into it would break that meaning and any stored
    // record that compares against it.
    const a = await deriveAccessPolicy(OBJECTIVE, { mode: 'audit', trustTier: '1' });
    const b = await deriveAccessPolicy(OBJECTIVE, { mode: 'audit', trustTier: '4' });

    expect(a.objectiveHash).toBe(b.objectiveHash);
  });
});
