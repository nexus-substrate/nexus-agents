/**
 * Tests for Governance Enforcer
 * @module mcp/gateway/governance-enforcer.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  classifyWithGovernance,
  auditGovernancePromotion,
  type GovernanceClassification,
} from './governance-enforcer.js';
import { RequestTier } from './tier-classifier.js';

// ============================================================================
// classifyWithGovernance — Tier 1 tools (no promotion)
// ============================================================================

describe('classifyWithGovernance — Tier 1', () => {
  it('returns DIRECT for read-only tools', () => {
    const result = classifyWithGovernance('list_experts', {});
    expect(result.tier).toBe(RequestTier.DIRECT);
    expect(result.promoted).toBe(false);
    expect(result.domain).toBe('none');
    expect(result.votingThreshold).toBeNull();
    expect(result.promotionReason).toBeNull();
  });

  it('returns DIRECT for memory_query', () => {
    const result = classifyWithGovernance('memory_query', { query: 'test' });
    expect(result.tier).toBe(RequestTier.DIRECT);
    expect(result.promoted).toBe(false);
  });
});

// ============================================================================
// classifyWithGovernance — Tier 2 tools (no promotion)
// ============================================================================

describe('classifyWithGovernance — Tier 2', () => {
  it('returns ANALYZED for delegate_to_model without keywords', () => {
    const result = classifyWithGovernance('delegate_to_model', { task: 'write hello world' });
    expect(result.tier).toBe(RequestTier.ANALYZED);
    expect(result.promoted).toBe(false);
    expect(result.votingThreshold).toBeNull();
  });

  it('returns ANALYZED for create_expert with non-governance role', () => {
    const result = classifyWithGovernance('create_expert', { role: 'code_expert' });
    expect(result.tier).toBe(RequestTier.ANALYZED);
    expect(result.promoted).toBe(false);
  });
});

// ============================================================================
// classifyWithGovernance — Security promotion
// ============================================================================

describe('classifyWithGovernance — security promotion', () => {
  it('promotes delegate_to_model with security keywords', () => {
    const result = classifyWithGovernance('delegate_to_model', {
      task: 'audit for security vulnerabilities',
    });
    expect(result.tier).toBe(RequestTier.ORCHESTRATED);
    expect(result.promoted).toBe(true);
    expect(result.domain).toBe('security');
    expect(result.votingThreshold).toBe('supermajority');
  });

  it('includes keyword in promotion reason', () => {
    const result = classifyWithGovernance('delegate_to_model', {
      task: 'fix the XSS issue on the form',
    });
    expect(result.promotionReason).toContain('xss');
    expect(result.promotionReason).toContain('supermajority');
  });

  it('promotes security_expert role', () => {
    const result = classifyWithGovernance('create_expert', { role: 'security_expert' });
    expect(result.tier).toBe(RequestTier.ORCHESTRATED);
    expect(result.promoted).toBe(true);
    expect(result.domain).toBe('security');
    expect(result.promotionReason).toContain('role=security_expert');
  });

  it('detects credentials keyword', () => {
    const result = classifyWithGovernance('delegate_to_model', {
      task: 'review credentials handling',
    });
    expect(result.domain).toBe('security');
    expect(result.promoted).toBe(true);
  });

  it('detects CVE keyword', () => {
    const result = classifyWithGovernance('delegate_to_model', {
      task: 'patch CVE-2024-1234',
    });
    expect(result.domain).toBe('security');
  });
});

// ============================================================================
// classifyWithGovernance — Architecture promotion
// ============================================================================

describe('classifyWithGovernance — architecture promotion', () => {
  it('promotes with architecture keyword', () => {
    const result = classifyWithGovernance('delegate_to_model', {
      task: 'review architecture changes',
    });
    expect(result.tier).toBe(RequestTier.ORCHESTRATED);
    expect(result.promoted).toBe(true);
    expect(result.domain).toBe('architecture');
    expect(result.votingThreshold).toBe('supermajority');
  });

  it('promotes breaking change keyword', () => {
    const result = classifyWithGovernance('delegate_to_model', {
      task: 'plan the breaking change to the API',
    });
    expect(result.domain).toBe('architecture');
  });

  it('promotes architecture_expert role', () => {
    const result = classifyWithGovernance('create_expert', { role: 'architecture_expert' });
    expect(result.tier).toBe(RequestTier.ORCHESTRATED);
    expect(result.domain).toBe('architecture');
    expect(result.promotionReason).toContain('role=architecture_expert');
  });

  it('promotes migration keyword', () => {
    const result = classifyWithGovernance('delegate_to_model', {
      task: 'plan database migration',
    });
    expect(result.domain).toBe('architecture');
  });
});

// ============================================================================
// classifyWithGovernance — Tier 3 tools (already orchestrated)
// ============================================================================

describe('classifyWithGovernance — already Tier 3', () => {
  it('orchestrate tool with security content is promoted', () => {
    const result = classifyWithGovernance('orchestrate', {
      task: 'security audit',
    });
    expect(result.tier).toBe(RequestTier.ORCHESTRATED);
    expect(result.promoted).toBe(true);
    expect(result.domain).toBe('security');
  });

  it('orchestrate tool without governance keywords is not promoted', () => {
    const result = classifyWithGovernance('orchestrate', {
      task: 'build a todo app',
    });
    expect(result.tier).toBe(RequestTier.ORCHESTRATED);
    expect(result.promoted).toBe(false);
    expect(result.domain).toBe('none');
    expect(result.votingThreshold).toBeNull();
  });
});

// ============================================================================
// classifyWithGovernance — text field scanning
// ============================================================================

describe('classifyWithGovernance — text fields', () => {
  it('scans proposal field', () => {
    const result = classifyWithGovernance('consensus_vote', {
      proposal: 'We should update our authentication flow',
    });
    expect(result.domain).toBe('security');
  });

  it('scans prompt field', () => {
    const result = classifyWithGovernance('execute_expert', {
      prompt: 'analyze the infrastructure redesign',
    });
    expect(result.domain).toBe('architecture');
  });

  it('ignores non-text fields', () => {
    const result = classifyWithGovernance('delegate_to_model', {
      task: 'simple task',
      metadata: { note: 'security stuff' },
    });
    expect(result.promoted).toBe(false);
  });
});

// ============================================================================
// auditGovernancePromotion
// ============================================================================

describe('auditGovernancePromotion', () => {
  it('logs for promoted requests', () => {
    const logger = { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn(), child: vi.fn() };
    const classification: GovernanceClassification = {
      tier: RequestTier.ORCHESTRATED,
      promoted: true,
      domain: 'security',
      votingThreshold: 'supermajority',
      promotionReason: 'security governance: keyword "xss" detected',
    };

    auditGovernancePromotion(classification, 'delegate_to_model', logger as never);

    expect(logger.warn).toHaveBeenCalledWith(
      'Governance promotion',
      expect.objectContaining({
        tool: 'delegate_to_model',
        domain: 'security',
        votingThreshold: 'supermajority',
      })
    );
  });

  it('does not log for non-promoted requests', () => {
    const logger = { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn(), child: vi.fn() };
    const classification: GovernanceClassification = {
      tier: RequestTier.DIRECT,
      promoted: false,
      domain: 'none',
      votingThreshold: null,
      promotionReason: null,
    };

    auditGovernancePromotion(classification, 'list_experts', logger as never);

    expect(logger.warn).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Tier overrides
// ============================================================================

describe('governance with overrides', () => {
  it('respects tier overrides for non-governance content', () => {
    const result = classifyWithGovernance(
      'delegate_to_model',
      { task: 'simple task' },
      { delegate_to_model: RequestTier.ORCHESTRATED }
    );
    expect(result.tier).toBe(RequestTier.ORCHESTRATED);
    expect(result.promoted).toBe(false);
  });

  it('governance promotion overrides even with config overrides', () => {
    const result = classifyWithGovernance(
      'delegate_to_model',
      { task: 'audit security' },
      { delegate_to_model: RequestTier.DIRECT }
    );
    expect(result.tier).toBe(RequestTier.ORCHESTRATED);
    expect(result.promoted).toBe(true);
  });
});
