/**
 * Governance integration tests for delegate_to_model (Issue #928, Phase 2)
 *
 * Tests governance-enforcer wiring into the delegate tool.
 */
import { describe, it, expect } from 'vitest';

import { _testing } from './delegate-to-model.js';
import { createLogger } from '../../core/index.js';
import type { GovernanceClassification } from '../gateway/governance-enforcer.js';

const { classifyDelegateGovernance, enrichWithGovernance } = _testing;
const logger = createLogger({ component: 'test' });

// ============================================================================
// classifyDelegateGovernance
// ============================================================================

describe('classifyDelegateGovernance', () => {
  it('returns no promotion for non-governance tasks', () => {
    const result = classifyDelegateGovernance({ task: 'Add a login button' }, logger);
    expect(result.promoted).toBe(false);
    expect(result.domain).toBe('none');
    expect(result.votingThreshold).toBeNull();
  });

  it('detects security domain from task keywords', () => {
    const result = classifyDelegateGovernance(
      { task: 'Review authentication and fix security vulnerabilities' },
      logger
    );
    expect(result.promoted).toBe(true);
    expect(result.domain).toBe('security');
    expect(result.votingThreshold).toBe('supermajority');
  });

  it('detects architecture domain from task keywords', () => {
    const result = classifyDelegateGovernance(
      { task: 'Refactor the microservice architecture' },
      logger
    );
    expect(result.promoted).toBe(true);
    expect(result.domain).toBe('architecture');
    expect(result.votingThreshold).toBe('supermajority');
  });
});

// ============================================================================
// enrichWithGovernance
// ============================================================================

describe('enrichWithGovernance', () => {
  const baseOutput = {
    recommended_model: 'claude-opus',
    reasoning: 'Best for complex tasks',
  };

  it('returns output unchanged when not promoted', () => {
    const notPromoted: GovernanceClassification = {
      tier: 1,
      promoted: false,
      domain: 'none',
      votingThreshold: null,
      promotionReason: null,
    };
    const result = enrichWithGovernance(baseOutput, notPromoted);
    expect(result).toEqual(baseOutput);
    expect(result).not.toHaveProperty('governance');
  });

  it('adds governance metadata when promoted', () => {
    const promoted: GovernanceClassification = {
      tier: 3,
      promoted: true,
      domain: 'security',
      votingThreshold: 'supermajority',
      promotionReason: 'security governance: keyword "vulnerability" detected',
    };
    const result = enrichWithGovernance(baseOutput, promoted);
    expect(result).toHaveProperty('governance');
    const gov = result['governance'] as Record<string, unknown>;
    expect(gov['domain']).toBe('security');
    expect(gov['votingThreshold']).toBe('supermajority');
    expect(gov['promotionReason']).toContain('security');
  });

  it('preserves all original output fields', () => {
    const promoted: GovernanceClassification = {
      tier: 3,
      promoted: true,
      domain: 'architecture',
      votingThreshold: 'supermajority',
      promotionReason: 'architecture governance',
    };
    const result = enrichWithGovernance(baseOutput, promoted);
    expect(result['recommended_model']).toBe('claude-opus');
    expect(result['reasoning']).toBe('Best for complex tasks');
  });
});
