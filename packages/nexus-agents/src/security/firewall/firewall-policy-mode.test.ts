/**
 * Firewall policy-mode gate tests (#5382, child of epic #5281).
 *
 * The gate exists because `HostileInputFirewall` is a PUBLISHED API
 * (`src/exports/security.ts`, `api-surface.txt`, with an export-contract test),
 * and the epic's remaining children (#5380, #5381) change what `process()`
 * decides. A supermajority panel ratified this child first precisely so those
 * changes have somewhere to land that is not a silent patch-release behaviour
 * change for external consumers.
 *
 * The load-bearing property is therefore the DEFAULT: absent the flag, the
 * firewall must behave byte-identically to today. A gate whose default alters
 * behaviour is not a gate.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_FIREWALL_POLICY_MODE,
  FirewallPolicyModeSchema,
  resolveFirewallPolicyMode,
} from './firewall-policy-mode.js';
import type { ILogger } from '../../core/index.js';

function makeLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as ILogger;
}

describe('firewall policy mode (#5382)', () => {
  describe('the default is the compatibility guarantee', () => {
    it("defaults to 'off' so a published consumer sees no behaviour change", () => {
      // This is the whole point of the child. #5380 and #5381 raise strictness
      // on an API other people call; landing that on a patch release without an
      // opt-in is the breakage the panel's dissent was about.
      expect(DEFAULT_FIREWALL_POLICY_MODE).toBe('off');
    });

    it('resolves to the default when the variable is unset', () => {
      expect(resolveFirewallPolicyMode({})).toBe('off');
    });

    it('resolves to the default when the variable is empty', () => {
      // Absence and emptiness are both "not configured", not a misconfiguration.
      expect(resolveFirewallPolicyMode({ NEXUS_FIREWALL_POLICY: '' })).toBe('off');
    });
  });

  describe('accepts the same tri-state as its sibling security flags', () => {
    it.each(['off', 'audit', 'enforce'] as const)('accepts %s', (mode) => {
      expect(resolveFirewallPolicyMode({ NEXUS_FIREWALL_POLICY: mode })).toBe(mode);
    });

    it('accepts mixed case, matching NEXUS_REPUTATION_GATING', () => {
      // The sibling lowercases before parsing; differing here would be a
      // gratuitous inconsistency between two flags an operator sets together.
      expect(resolveFirewallPolicyMode({ NEXUS_FIREWALL_POLICY: 'ENFORCE' })).toBe('enforce');
    });

    it('exposes exactly the three modes, no more', () => {
      expect(FirewallPolicyModeSchema.options).toEqual(['off', 'audit', 'enforce']);
    });
  });

  describe('a misconfiguration degrades safely and observably', () => {
    it('coerces a typo to the default rather than throwing', () => {
      // A security layer must not fail-closed at startup on a typo (#3130).
      expect(resolveFirewallPolicyMode({ NEXUS_FIREWALL_POLICY: 'enfroce' })).toBe('off');
    });

    it('warns on a typo, so the coercion is not silent', () => {
      // The coercion used to be silent across these flags; #3130 added the warn
      // because a typo'd `enforce` looked identical to an unset variable.
      const logger = makeLogger();
      resolveFirewallPolicyMode({ NEXUS_FIREWALL_POLICY: 'enfroce' }, logger);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('NEXUS_FIREWALL_POLICY'),
        expect.objectContaining({ raw: 'enfroce' })
      );
    });

    it('does not warn when the variable is simply unset', () => {
      const logger = makeLogger();
      resolveFirewallPolicyMode({}, logger);
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });
});
