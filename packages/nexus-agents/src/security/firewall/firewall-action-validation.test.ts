/**
 * Per-action corroboration surface (#5382, child of epic #5281).
 *
 * `stages.corroboration` was declared in `firewall-types.ts` and read nowhere in
 * the pipeline: a caller could set it and setting it did nothing. That is the
 * "configuration flag that cannot change behaviour" defect the epic exists to
 * fix, and the sharpest form of it — a consumer who set `corroboration: true`
 * believed they had a stage they did not have.
 *
 * The issue's stated fix ("wire the stage to `validateActionCorroboration`") is
 * not directly possible: `validateCorroboration` takes an `AgentAction`, while
 * `process()` is input-shaped and constructs no action — it classifies and
 * labels an input, and the action is decided later by the consumer. So the flag
 * is wired to a NEW per-action entry point instead, which is additionally what
 * #5383's migration needs: production calls corroboration per action, so callers
 * cannot move onto the firewall unless it offers that shape.
 *
 * The load-bearing property under test is that a DISABLED stage reports
 * `evaluated: false` rather than `satisfied: true`. Letting "not checked" render
 * as "checked and fine" is exactly the vacuous verdict the governance rules
 * forbid, and it is the failure mode a caller would never notice.
 */

import { describe, it, expect } from 'vitest';

import { createGitHubAdapter } from './github-adapter.js';
import { HostileInputFirewall } from './firewall-pipeline.js';
import type { SourceCitation } from '../action-schema.js';

/** Tier-1 source: satisfies corroboration wherever it is accepted. */
const repoFile: SourceCitation = { type: 'repoFile', path: 'src/main.ts' };

/** An action whose corroboration requirements are met. */
function corroborated(): { type: 'SummarizeIssue'; summary: string; sources: SourceCitation[] } {
  return { type: 'SummarizeIssue', summary: 'Test summary', sources: [repoFile] };
}

/** The same action with NO sources — corroboration cannot be satisfied. */
function uncorroborated(): { type: 'SummarizeIssue'; summary: string; sources: SourceCitation[] } {
  return { type: 'SummarizeIssue', summary: 'Test summary', sources: [] };
}

function createFirewall(overrides: Record<string, unknown> = {}): HostileInputFirewall {
  return new HostileInputFirewall({ adapter: createGitHubAdapter(), ...overrides });
}

describe('validateAction — the corroboration stage becomes readable (#5382)', () => {
  describe('a disabled stage reports unmeasured, never satisfied', () => {
    it('reports evaluated:false when corroboration is off (the default)', () => {
      // `stages.corroboration` defaults to false. The dangerous implementation
      // is one that returns a satisfied-looking result here: a caller would read
      // it as "corroboration passed" when nothing ran.
      const result = createFirewall().validateAction(uncorroborated());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.evaluated).toBe(false);
      // There must be no `satisfied: true` hiding on an unevaluated result.
      expect(result.value).not.toHaveProperty('satisfied', true);
    });

    it('names WHY it was not evaluated, so absence is attributable', () => {
      const result = createFirewall().validateAction(uncorroborated());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Assert the discriminant BEFORE narrowing on it. Written as an early
      // `return` this passed vacuously under mutation: a mutant that reported
      // `evaluated: true` skipped the assertion entirely and still went green.
      expect(result.value.evaluated).toBe(false);
      if (result.value.evaluated) return;
      expect(result.value.reason).toBe('corroboration-stage-disabled');
    });

    it('does not refuse under enforce when the stage never ran', () => {
      // The mode gates the RESPONSE to a finding, never manufactures one. An
      // unevaluated action cannot be refused for failing a check that was skipped.
      const fw = createFirewall({ policyMode: 'enforce' });

      expect(fw.validateAction(uncorroborated()).ok).toBe(true);
    });
  });

  describe('an enabled stage actually evaluates', () => {
    it('reports satisfied for a corroborated action', () => {
      const fw = createFirewall({ stages: { corroboration: true } });
      const result = fw.validateAction(corroborated());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.evaluated).toBe(true);
      if (!result.value.evaluated) return;
      expect(result.value.satisfied).toBe(true);
      expect(result.value.missing).toEqual([]);
      expect(result.value.corroboratingSources).toContain(repoFile);
    });

    it('reports unsatisfied, with what is missing, for an uncorroborated action', () => {
      // The control against a stage that evaluates but always passes.
      const fw = createFirewall({ stages: { corroboration: true } });
      const result = fw.validateAction(uncorroborated());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.evaluated).toBe(true);
      if (!result.value.evaluated) return;
      expect(result.value.satisfied).toBe(false);
      expect(result.value.missing.length).toBeGreaterThan(0);
    });

    it('turning the flag on changes the outcome — the flag is now readable', () => {
      // This is the defect stated as a test: before this change, these two
      // configurations were indistinguishable.
      const off = createFirewall().validateAction(uncorroborated());
      const on = createFirewall({ stages: { corroboration: true } }).validateAction(
        uncorroborated()
      );

      expect(off.ok && on.ok).toBe(true);
      if (!off.ok || !on.ok) return;
      expect(off.value.evaluated).not.toBe(on.value.evaluated);
    });
  });

  describe('the policy mode gates the response', () => {
    it('off surfaces the failure without refusing', () => {
      const fw = createFirewall({ stages: { corroboration: true }, policyMode: 'off' });
      const result = fw.validateAction(uncorroborated());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.evaluated).toBe(true);
      if (!result.value.evaluated) return;
      expect(result.value.satisfied).toBe(false);
      expect(result.value.wouldRefuse).toBe(false);
    });

    it('audit reports what enforce would refuse, without refusing', () => {
      const fw = createFirewall({ stages: { corroboration: true }, policyMode: 'audit' });
      const result = fw.validateAction(uncorroborated());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.evaluated).toBe(true);
      if (!result.value.evaluated) return;
      expect(result.value.wouldRefuse).toBe(true);
    });

    it('enforce refuses an uncorroborated action', () => {
      const fw = createFirewall({ stages: { corroboration: true }, policyMode: 'enforce' });
      const result = fw.validateAction(uncorroborated());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('POLICY_REFUSED');
      expect(result.error.stage).toBe('corroboration');
      // The refusal must say what was missing, or a caller cannot act on it.
      expect(result.error.message.length).toBeGreaterThan(0);
    });

    it('enforce does NOT refuse a corroborated action — not a kill switch', () => {
      // Testing only the refusal would let "refuse every action under enforce"
      // pass every assertion above.
      const fw = createFirewall({ stages: { corroboration: true }, policyMode: 'enforce' });

      expect(fw.validateAction(corroborated()).ok).toBe(true);
    });
  });
});
