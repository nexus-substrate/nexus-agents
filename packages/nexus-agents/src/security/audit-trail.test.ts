/**
 * Tests for AuditTrail — structured security event logging and querying.
 *
 * (Source: Issue #832 — Security audit trail)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AuditTrail,
  createAuditTrail,
  emitTrustEvent,
  emitPolicyEvent,
  emitCorroborationEvent,
  emitReputationEvent,
  emitSanitizationEvent,
} from './audit-trail.js';

describe('AuditTrail', () => {
  let trail: AuditTrail;

  beforeEach(() => {
    trail = createAuditTrail();
  });

  describe('append', () => {
    it('assigns unique sequential IDs', () => {
      const id1 = emitTrustEvent(trail, {
        username: 'alice',
        assignedTier: '1',
        userRole: 'maintainer',
        isAllowlisted: true,
        wasDowngraded: false,
        reason: 'Maintainer allowlist match',
      });
      const id2 = emitTrustEvent(trail, {
        username: 'bob',
        assignedTier: '3',
        userRole: 'unknown',
        isAllowlisted: false,
        wasDowngraded: false,
        reason: 'Unknown author',
      });

      expect(id1).toBe('audit-1');
      expect(id2).toBe('audit-2');
      expect(trail.size).toBe(2);
    });

    it('adds timestamps to events', () => {
      emitTrustEvent(trail, {
        username: 'alice',
        assignedTier: '1',
        userRole: 'maintainer',
        isAllowlisted: true,
        wasDowngraded: false,
        reason: 'test',
      });

      const events = trail.query();
      expect(events).toHaveLength(1);
      expect(events[0]?.timestamp).toBeDefined();
    });
  });

  describe('emitters', () => {
    it('emitTrustEvent creates trust_classification event', () => {
      emitTrustEvent(trail, {
        username: 'alice',
        assignedTier: '1',
        userRole: 'maintainer',
        isAllowlisted: true,
        wasDowngraded: false,
        reason: 'Maintainer',
      });

      const events = trail.query({ type: 'trust_classification' });
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('trust_classification');
      if (events[0]?.type === 'trust_classification') {
        expect(events[0].username).toBe('alice');
        expect(events[0].assignedTier).toBe('1');
      }
    });

    it('emitPolicyEvent creates policy_gate event', () => {
      emitPolicyEvent(trail, {
        actionType: 'ProposeLabels',
        allowed: true,
        requiresApproval: false,
        inputTrustTier: '2',
        violationRules: [],
      });

      const events = trail.query({ type: 'policy_gate' });
      expect(events).toHaveLength(1);
      if (events[0]?.type === 'policy_gate') {
        expect(events[0].allowed).toBe(true);
        expect(events[0].inputTrustTier).toBe('2');
      }
    });

    it('emitCorroborationEvent creates corroboration event', () => {
      emitCorroborationEvent(trail, {
        actionType: 'ClassifyIssue',
        satisfied: true,
        sourceCount: 2,
        missingRequirements: [],
      });

      const events = trail.query({ type: 'corroboration' });
      expect(events).toHaveLength(1);
      if (events[0]?.type === 'corroboration') {
        expect(events[0].satisfied).toBe(true);
        expect(events[0].sourceCount).toBe(2);
      }
    });

    it('emitReputationEvent creates reputation event', () => {
      emitReputationEvent(trail, {
        username: 'suspect',
        reputationScore: 0.3,
        isSuspicious: true,
        effectiveTier: '4',
        signalCount: 3,
      });

      const events = trail.query({ type: 'reputation' });
      expect(events).toHaveLength(1);
      if (events[0]?.type === 'reputation') {
        expect(events[0].isSuspicious).toBe(true);
        expect(events[0].effectiveTier).toBe('4');
      }
    });

    it('emitSanitizationEvent creates sanitization event', () => {
      emitSanitizationEvent(trail, {
        source: 'issue-body',
        wasModified: true,
        strippedCount: 3,
        injectionFlagCount: 1,
      });

      const events = trail.query({ type: 'sanitization' });
      expect(events).toHaveLength(1);
      if (events[0]?.type === 'sanitization') {
        expect(events[0].wasModified).toBe(true);
        expect(events[0].strippedCount).toBe(3);
      }
    });
  });

  describe('query', () => {
    beforeEach(() => {
      emitTrustEvent(trail, {
        username: 'owner',
        assignedTier: '1',
        userRole: 'maintainer',
        isAllowlisted: true,
        wasDowngraded: false,
        reason: 'Owner',
      });
      emitPolicyEvent(trail, {
        actionType: 'ProposeLabels',
        allowed: true,
        requiresApproval: false,
        inputTrustTier: '1',
        violationRules: [],
      });
      emitTrustEvent(trail, {
        username: 'stranger',
        assignedTier: '3',
        userRole: 'unknown',
        isAllowlisted: false,
        wasDowngraded: false,
        reason: 'Unknown',
      });
      emitPolicyEvent(trail, {
        actionType: 'DraftReply',
        allowed: false,
        requiresApproval: true,
        inputTrustTier: '3',
        violationRules: ['RULE_OF_TWO'],
      });
    });

    it('returns all events when no filter', () => {
      expect(trail.query()).toHaveLength(4);
    });

    it('filters by type', () => {
      const trust = trail.query({ type: 'trust_classification' });
      expect(trust).toHaveLength(2);

      const policy = trail.query({ type: 'policy_gate' });
      expect(policy).toHaveLength(2);
    });

    it('filters by trust tier', () => {
      const tier1 = trail.query({ trustTier: '1' });
      expect(tier1).toHaveLength(2); // trust + policy for tier 1

      const tier3 = trail.query({ trustTier: '3' });
      expect(tier3).toHaveLength(2); // trust + policy for tier 3
    });

    it('respects limit', () => {
      const limited = trail.query({ limit: 2 });
      expect(limited).toHaveLength(2);
      // Returns last 2 events
      expect(limited[0]?.type).toBe('trust_classification');
      expect(limited[1]?.type).toBe('policy_gate');
    });

    it('combines filters', () => {
      const result = trail.query({ type: 'policy_gate', trustTier: '3' });
      expect(result).toHaveLength(1);
      if (result[0]?.type === 'policy_gate') {
        expect(result[0].allowed).toBe(false);
      }
    });
  });

  describe('bounds enforcement', () => {
    it('evicts oldest events when MAX_EVENTS exceeded', () => {
      // Add many events to trigger eviction
      for (let i = 0; i < 10_050; i++) {
        emitTrustEvent(trail, {
          username: `user-${String(i)}`,
          assignedTier: '2',
          userRole: 'contributor',
          isAllowlisted: false,
          wasDowngraded: false,
          reason: 'test',
        });
      }

      // Should be bounded at MAX_EVENTS (10,000)
      expect(trail.size).toBeLessThanOrEqual(10_000);
    });
  });

  describe('clear', () => {
    it('removes all events', () => {
      emitTrustEvent(trail, {
        username: 'test',
        assignedTier: '2',
        userRole: 'contributor',
        isAllowlisted: false,
        wasDowngraded: false,
        reason: 'test',
      });

      expect(trail.size).toBe(1);
      trail.clear();
      expect(trail.size).toBe(0);
      expect(trail.query()).toHaveLength(0);
    });
  });
});
