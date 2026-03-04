/**
 * Security Export Contract Tests
 *
 * Validates that all security-related public symbols are importable
 * from the main barrel. Covers Epic #818 (Untrusted Input Hardening)
 * and Issue #826 (Hostile Input Firewall).
 *
 * @module exports/security-export-contracts
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Trust types and classifier (Epic #818 Phase 1)
// ============================================================================
import {
  TrustTierSchema,
  TRUST_TIER_NUMERIC,
  sanitizeInput,
  classifyTrust,
  mapAuthorAssociation,
  canInfluenceDecisions,
  requiresCorroboration,
  getRequiredTrustTier,
  AgentActionSchema,
  SourceCitationSchema,
  validateAgentAction,
  isReadOnlyAction,
  isMutatingAction,
  requiresCitation,
} from '../index.js';

// ============================================================================
// Policy gate and corroboration (Epic #818 Phase 2)
// ============================================================================
import {
  evaluateSecurityPolicy,
  canProceed,
  ViolationSchema,
  validateCorroboration,
  getCorroborationRules,
} from '../index.js';

// ============================================================================
// Reputation model (Epic #818 Phase 3)
// ============================================================================
import { assessReputation, ReputationCache, SuspiciousSignalSchema } from '../index.js';

// ============================================================================
// Audit trail (Issue #832)
// ============================================================================
import {
  AuditTrail,
  createAuditTrail,
  emitTrustEvent,
  emitPolicyEvent,
  emitCorroborationEvent,
  emitReputationEvent,
  emitSanitizationEvent,
  emitGraphExecutionEvent,
  createGraphAuditBridge,
} from '../index.js';

// ============================================================================
// Hostile input firewall (Issue #826)
// ============================================================================
import { HostileInputFirewall, generateATL, parseATL, createGitHubAdapter } from '../index.js';

// ============================================================================
// Tests
// ============================================================================

describe('Security export contracts', () => {
  describe('trust types and classifier (Phase 1)', () => {
    it('exports TrustTierSchema', () => {
      expect(TrustTierSchema).toBeDefined();
      expect(TrustTierSchema.parse('1')).toBe('1');
    });

    it('exports TRUST_TIER_NUMERIC', () => {
      expect(TRUST_TIER_NUMERIC).toBeDefined();
      expect(TRUST_TIER_NUMERIC['1']).toBe(1);
      expect(TRUST_TIER_NUMERIC['4']).toBe(4);
    });

    it('exports sanitizeInput', () => {
      expect(typeof sanitizeInput).toBe('function');
    });

    it('exports trust classifier functions', () => {
      expect(typeof classifyTrust).toBe('function');
      expect(typeof mapAuthorAssociation).toBe('function');
      expect(typeof canInfluenceDecisions).toBe('function');
      expect(typeof requiresCorroboration).toBe('function');
      expect(typeof getRequiredTrustTier).toBe('function');
    });

    it('exports action schema validators', () => {
      expect(AgentActionSchema).toBeDefined();
      expect(SourceCitationSchema).toBeDefined();
      expect(typeof validateAgentAction).toBe('function');
      expect(typeof isReadOnlyAction).toBe('function');
      expect(typeof isMutatingAction).toBe('function');
      expect(typeof requiresCitation).toBe('function');
    });
  });

  describe('policy gate and corroboration (Phase 2)', () => {
    it('exports policy gate functions', () => {
      expect(typeof evaluateSecurityPolicy).toBe('function');
      expect(typeof canProceed).toBe('function');
      expect(ViolationSchema).toBeDefined();
    });

    it('exports corroboration functions', () => {
      expect(typeof validateCorroboration).toBe('function');
      expect(typeof getCorroborationRules).toBe('function');
    });
  });

  describe('reputation model (Phase 3)', () => {
    it('exports reputation functions', () => {
      expect(typeof assessReputation).toBe('function');
      expect(ReputationCache).toBeDefined();
      expect(SuspiciousSignalSchema).toBeDefined();
    });
  });

  describe('audit trail (Issue #832)', () => {
    it('exports AuditTrail class and factory', () => {
      expect(AuditTrail).toBeDefined();
      expect(typeof AuditTrail).toBe('function');
      expect(typeof createAuditTrail).toBe('function');
    });

    it('exports emit functions', () => {
      expect(typeof emitTrustEvent).toBe('function');
      expect(typeof emitPolicyEvent).toBe('function');
      expect(typeof emitCorroborationEvent).toBe('function');
      expect(typeof emitReputationEvent).toBe('function');
      expect(typeof emitSanitizationEvent).toBe('function');
      expect(typeof emitGraphExecutionEvent).toBe('function');
    });

    it('exports graph audit bridge factory', () => {
      expect(typeof createGraphAuditBridge).toBe('function');
    });
  });

  describe('hostile input firewall (Issue #826)', () => {
    it('exports HostileInputFirewall class', () => {
      expect(HostileInputFirewall).toBeDefined();
      expect(typeof HostileInputFirewall).toBe('function');
    });

    it('exports ATL functions', () => {
      expect(typeof generateATL).toBe('function');
      expect(typeof parseATL).toBe('function');
    });

    it('exports GitHub adapter factory', () => {
      expect(typeof createGitHubAdapter).toBe('function');
    });
  });
});
