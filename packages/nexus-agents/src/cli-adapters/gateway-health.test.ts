/**
 * Tests for gateway health evidence and admission policy (#4391 increment B).
 *
 * The two named regression cases are real incidents, one week apart, in
 * opposite directions — they are the reason this module exists and the reason
 * the policy is not a boolean.
 *
 * @module cli-adapters/gateway-health.test
 */

import { describe, it, expect } from 'vitest';
import {
  isAtLeast,
  resolveAvailability,
  isSelectable,
  AUTH_EVIDENCE_RUNGS,
  type GatewayHealth,
  type AuthEvidence,
} from './gateway-health.js';

function health(over: Partial<GatewayHealth> = {}): GatewayHealth {
  return { supports: 'service', evidence: 'service', passed: true, reachable: true, ...over };
}

describe('evidence rungs', () => {
  it('orders weakest to strongest', () => {
    expect([...AUTH_EVIDENCE_RUNGS]).toEqual(['none', 'local', 'service', 'completion']);
  });

  it('compares by strength, not equality', () => {
    expect(isAtLeast('completion', 'service')).toBe(true);
    expect(isAtLeast('service', 'service')).toBe(true);
    expect(isAtLeast('local', 'service')).toBe(false);
    expect(isAtLeast('none', 'local')).toBe(false);
  });
});

describe('admission policy (#4391)', () => {
  describe('regression: the two incidents this replaces', () => {
    it('does not exclude a working gateway whose local credential looks stale', () => {
      // agy (#4346): served correct answers while `~/.gemini/oauth_creds.json`
      // sat untouched with an expiry 5.5h in the past. A credential check said
      // "needs login"; a live `agy models` call succeeded.
      const agy = health({ supports: 'service', evidence: 'service', passed: true });

      expect(resolveAvailability(agy)).toBe('available');
      expect(isSelectable(agy)).toBe(true);
    });

    it('does not report a dead gateway as verified on a valid credential file', () => {
      // The retired gemini CLI (#4318): valid unexpired credential, failing
      // every invocation with IneligibleTierError. Local evidence alone must
      // never resolve to `available`.
      const deadCli = health({ supports: 'local', evidence: 'local', passed: true });

      expect(resolveAvailability(deadCli)).toBe('unknown');
      expect(resolveAvailability(deadCli)).not.toBe('available');
    });
  });

  describe('local-only gateways are unverifiable, never verified', () => {
    const cases: ReadonlyArray<[string, boolean]> = [
      ['passing', true],
      ['failing', false],
    ];

    for (const [label, passed] of cases) {
      it(`reports unknown for a ${label} local-only check`, () => {
        // Unanimous across both sides of the 4/3 split: a FAILING local check
        // must not hard-exclude either. It is evidence about an artifact, not
        // about the gateway.
        const h = health({ supports: 'local', evidence: 'local', passed });

        expect(resolveAvailability(h)).toBe('unknown');
        expect(isSelectable(h)).toBe(true);
      });
    }
  });

  describe('service-grade evidence yields a real verdict', () => {
    it('admits a gateway the live service accepted', () => {
      expect(resolveAvailability(health({ passed: true }))).toBe('available');
    });

    it('withholds a gateway the live service rejected', () => {
      const rejected = health({ passed: false });

      expect(resolveAvailability(rejected)).toBe('unavailable');
      expect(isSelectable(rejected)).toBe(false);
    });

    it('treats a completion as at least service-grade', () => {
      const served = health({ supports: 'completion', evidence: 'completion', passed: true });

      expect(resolveAvailability(served)).toBe('available');
    });
  });

  describe('transient failure is not an auth verdict', () => {
    it('reports unknown when the gateway could not be contacted', () => {
      // Flaky network must not mark a working gateway dead — that is the same
      // false-negative class the module exists to remove.
      const offline = health({ reachable: false, passed: false });

      expect(resolveAvailability(offline)).toBe('unknown');
      expect(isSelectable(offline)).toBe(true);
    });

    it('does not let unreachability be read as rejection', () => {
      const offline = health({ reachable: false, passed: false });

      expect(resolveAvailability(offline)).not.toBe('unavailable');
    });
  });

  describe('a gateway that supports service but has not probed yet', () => {
    it('is unknown rather than assumed good or bad', () => {
      const unprobed = health({ supports: 'service', evidence: 'none', passed: false });

      expect(resolveAvailability(unprobed)).toBe('unknown');
      expect(isSelectable(unprobed)).toBe(true);
    });
  });

  it('never returns available on anything weaker than service evidence', () => {
    const weak: AuthEvidence[] = ['none', 'local'];
    for (const supports of weak) {
      for (const evidence of weak) {
        const h = health({ supports, evidence, passed: true });
        expect(resolveAvailability(h)).not.toBe('available');
      }
    }
  });
});
