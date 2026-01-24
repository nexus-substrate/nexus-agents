/**
 * Puppeteer Policy Factory
 *
 * Factory functions for creating policy engines based on configuration.
 *
 * @module agents/orchestration/puppeteer-policy-factory
 * (Source: Issue #385, Issue #404)
 */

import type { IPolicyEngine } from './policy-types.js';
import type { PolicyMode } from './puppeteer-config-types.js';
import { createRuleBasedPolicy } from './rule-based-policy.js';
import { createLearnablePolicy } from './learnable-policy.js';

// =============================================================================
// Policy Factory
// =============================================================================

/**
 * Creates a policy engine based on the configured policy mode.
 *
 * @param policyMode - Policy selection strategy
 * @returns Policy engine for the specified mode
 */
export function createPolicyForMode(policyMode: PolicyMode): IPolicyEngine {
  switch (policyMode) {
    case 'learned':
      return createLearnablePolicy();
    case 'hybrid':
      // Hybrid mode uses learnable policy with lower learning rate
      // for more stable exploration/exploitation balance
      return createLearnablePolicy({ learningRate: 0.005 });
    case 'rule_based':
    default:
      return createRuleBasedPolicy();
  }
}
