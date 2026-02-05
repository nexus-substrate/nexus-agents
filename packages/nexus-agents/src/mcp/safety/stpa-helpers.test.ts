/**
 * Tests for STPA Helper Functions
 * @module mcp/safety/stpa-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { Hazard, UnsafeControlAction, ToolAnalysisResult } from './stpa-types.js';
import {
  HazardCategory,
  HazardSeverity,
  HazardLikelihood,
  UnsafeControlActionType,
  ConstraintEnforcement,
  ConstraintPriority,
  RiskLevel,
} from './stpa-types.js';
import {
  SEVERITY_WEIGHTS,
  LIKELIHOOD_WEIGHTS,
  calculateRiskScore,
  determineRiskLevel,
  getEnforcementForCategory,
  getPriorityForSeverity,
  getEnforcementAction,
  getConditionFromUca,
  generateConstraintDescription,
  generateValidationFunctionName,
  findHazardInteractions,
  generateSummary,
} from './stpa-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeHazard(overrides: Partial<Hazard> = {}): Hazard {
  return {
    id: 'H-001',
    description: 'Test hazard',
    category: HazardCategory.DATA_LOSS,
    severity: HazardSeverity.MEDIUM,
    likelihood: HazardLikelihood.POSSIBLE,
    triggerConditions: ['test'],
    consequences: ['test consequence'],
    ...overrides,
  };
}

function makeUca(overrides: Partial<UnsafeControlAction> = {}): UnsafeControlAction {
  return {
    id: 'UCA-001',
    toolName: 'test_tool',
    type: UnsafeControlActionType.PROVIDED_CAUSES_HAZARD,
    description: 'Test UCA',
    unsafeContext: 'unsafe input',
    relatedHazards: ['H-001'],
    ...overrides,
  };
}

function makeToolResult(overrides: Partial<ToolAnalysisResult> = {}): ToolAnalysisResult {
  return {
    toolName: 'test_tool',
    hazards: [],
    unsafeControlActions: [],
    safetyConstraints: [],
    riskScore: 50,
    riskLevel: RiskLevel.MODERATE,
    analyzedAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Constants
// ============================================================================

describe('SEVERITY_WEIGHTS', () => {
  it('has weights for all severity levels', () => {
    expect(SEVERITY_WEIGHTS[HazardSeverity.CRITICAL]).toBe(40);
    expect(SEVERITY_WEIGHTS[HazardSeverity.HIGH]).toBe(30);
    expect(SEVERITY_WEIGHTS[HazardSeverity.MEDIUM]).toBe(20);
    expect(SEVERITY_WEIGHTS[HazardSeverity.LOW]).toBe(10);
  });
});

describe('LIKELIHOOD_WEIGHTS', () => {
  it('has weights for all likelihood levels', () => {
    expect(LIKELIHOOD_WEIGHTS[HazardLikelihood.ALMOST_CERTAIN]).toBe(1.0);
    expect(LIKELIHOOD_WEIGHTS[HazardLikelihood.LIKELY]).toBe(0.8);
    expect(LIKELIHOOD_WEIGHTS[HazardLikelihood.POSSIBLE]).toBe(0.6);
    expect(LIKELIHOOD_WEIGHTS[HazardLikelihood.UNLIKELY]).toBe(0.4);
    expect(LIKELIHOOD_WEIGHTS[HazardLikelihood.RARE]).toBe(0.2);
  });
});

// ============================================================================
// calculateRiskScore
// ============================================================================

describe('calculateRiskScore', () => {
  it('returns 0 for empty hazards', () => {
    expect(calculateRiskScore([])).toBe(0);
  });

  it('calculates score for single critical/certain hazard', () => {
    const hazards = [
      makeHazard({
        severity: HazardSeverity.CRITICAL,
        likelihood: HazardLikelihood.ALMOST_CERTAIN,
      }),
    ];
    // score = 40 * 1.0 = 40, maxPossible = 1 * 40 = 40, normalized = 100
    expect(calculateRiskScore(hazards)).toBe(100);
  });

  it('calculates score for single low/rare hazard', () => {
    const hazards = [
      makeHazard({ severity: HazardSeverity.LOW, likelihood: HazardLikelihood.RARE }),
    ];
    // score = 10 * 0.2 = 2, maxPossible = 1 * 40 = 40, normalized = round(2/40 * 100) = 5
    expect(calculateRiskScore(hazards)).toBe(5);
  });

  it('normalizes multiple hazards', () => {
    const hazards = [
      makeHazard({ severity: HazardSeverity.HIGH, likelihood: HazardLikelihood.LIKELY }),
      makeHazard({ severity: HazardSeverity.LOW, likelihood: HazardLikelihood.UNLIKELY }),
    ];
    // score = 30*0.8 + 10*0.4 = 24 + 4 = 28
    // maxPossible = 2 * 40 = 80
    // normalized = round(28/80 * 100) = 35
    expect(calculateRiskScore(hazards)).toBe(35);
  });

  it('caps at 100', () => {
    const hazards = [
      makeHazard({
        severity: HazardSeverity.CRITICAL,
        likelihood: HazardLikelihood.ALMOST_CERTAIN,
      }),
      makeHazard({
        severity: HazardSeverity.CRITICAL,
        likelihood: HazardLikelihood.ALMOST_CERTAIN,
      }),
    ];
    expect(calculateRiskScore(hazards)).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// determineRiskLevel
// ============================================================================

describe('determineRiskLevel', () => {
  it('returns MINIMAL for score 0-20', () => {
    expect(determineRiskLevel(0)).toBe(RiskLevel.MINIMAL);
    expect(determineRiskLevel(20)).toBe(RiskLevel.MINIMAL);
  });

  it('returns LOW for score 21-40', () => {
    expect(determineRiskLevel(21)).toBe(RiskLevel.LOW);
    expect(determineRiskLevel(40)).toBe(RiskLevel.LOW);
  });

  it('returns MODERATE for score 41-60', () => {
    expect(determineRiskLevel(41)).toBe(RiskLevel.MODERATE);
    expect(determineRiskLevel(60)).toBe(RiskLevel.MODERATE);
  });

  it('returns HIGH for score 61-80', () => {
    expect(determineRiskLevel(61)).toBe(RiskLevel.HIGH);
    expect(determineRiskLevel(80)).toBe(RiskLevel.HIGH);
  });

  it('returns CRITICAL for score 81+', () => {
    expect(determineRiskLevel(81)).toBe(RiskLevel.CRITICAL);
    expect(determineRiskLevel(100)).toBe(RiskLevel.CRITICAL);
  });
});

// ============================================================================
// getEnforcementForCategory
// ============================================================================

describe('getEnforcementForCategory', () => {
  it('returns PREVENT for data loss', () => {
    expect(getEnforcementForCategory(HazardCategory.DATA_LOSS)).toBe(ConstraintEnforcement.PREVENT);
  });

  it('returns PREVENT for privilege escalation', () => {
    expect(getEnforcementForCategory(HazardCategory.PRIVILEGE_ESCALATION)).toBe(
      ConstraintEnforcement.PREVENT
    );
  });

  it('returns PREVENT for unauthorized execution', () => {
    expect(getEnforcementForCategory(HazardCategory.UNAUTHORIZED_EXECUTION)).toBe(
      ConstraintEnforcement.PREVENT
    );
  });

  it('returns SANITIZE for information disclosure', () => {
    expect(getEnforcementForCategory(HazardCategory.INFORMATION_DISCLOSURE)).toBe(
      ConstraintEnforcement.SANITIZE
    );
  });

  it('returns SANITIZE for injection', () => {
    expect(getEnforcementForCategory(HazardCategory.INJECTION)).toBe(
      ConstraintEnforcement.SANITIZE
    );
  });

  it('returns RATE_LIMIT for resource exhaustion', () => {
    expect(getEnforcementForCategory(HazardCategory.RESOURCE_EXHAUSTION)).toBe(
      ConstraintEnforcement.RATE_LIMIT
    );
  });

  it('returns RATE_LIMIT for denial of service', () => {
    expect(getEnforcementForCategory(HazardCategory.DENIAL_OF_SERVICE)).toBe(
      ConstraintEnforcement.RATE_LIMIT
    );
  });

  it('returns REQUIRE_CONFIRMATION for integrity violation', () => {
    expect(getEnforcementForCategory(HazardCategory.INTEGRITY_VIOLATION)).toBe(
      ConstraintEnforcement.REQUIRE_CONFIRMATION
    );
  });
});

// ============================================================================
// getPriorityForSeverity
// ============================================================================

describe('getPriorityForSeverity', () => {
  it('maps CRITICAL to CRITICAL priority', () => {
    expect(getPriorityForSeverity(HazardSeverity.CRITICAL)).toBe(ConstraintPriority.CRITICAL);
  });

  it('maps HIGH to HIGH priority', () => {
    expect(getPriorityForSeverity(HazardSeverity.HIGH)).toBe(ConstraintPriority.HIGH);
  });

  it('maps MEDIUM to NORMAL priority', () => {
    expect(getPriorityForSeverity(HazardSeverity.MEDIUM)).toBe(ConstraintPriority.NORMAL);
  });

  it('maps LOW to LOW priority', () => {
    expect(getPriorityForSeverity(HazardSeverity.LOW)).toBe(ConstraintPriority.LOW);
  });
});

// ============================================================================
// getEnforcementAction
// ============================================================================

describe('getEnforcementAction', () => {
  it('returns correct action for PREVENT', () => {
    expect(getEnforcementAction(ConstraintEnforcement.PREVENT)).toBe('Block tool invocation');
  });

  it('returns correct action for REQUIRE_CONFIRMATION', () => {
    expect(getEnforcementAction(ConstraintEnforcement.REQUIRE_CONFIRMATION)).toBe(
      'Require explicit confirmation'
    );
  });

  it('returns correct action for SANITIZE', () => {
    expect(getEnforcementAction(ConstraintEnforcement.SANITIZE)).toBe('Sanitize input');
  });

  it('returns correct action for RATE_LIMIT', () => {
    expect(getEnforcementAction(ConstraintEnforcement.RATE_LIMIT)).toBe('Apply rate limiting');
  });

  it('returns correct action for REQUIRE_PRIVILEGE', () => {
    expect(getEnforcementAction(ConstraintEnforcement.REQUIRE_PRIVILEGE)).toBe(
      'Require elevated privileges'
    );
  });

  it('returns correct action for ALERT', () => {
    expect(getEnforcementAction(ConstraintEnforcement.ALERT)).toBe('Log and alert');
  });
});

// ============================================================================
// getConditionFromUca
// ============================================================================

describe('getConditionFromUca', () => {
  it('handles PROVIDED_CAUSES_HAZARD', () => {
    const uca = makeUca({
      type: UnsafeControlActionType.PROVIDED_CAUSES_HAZARD,
      unsafeContext: 'malicious input',
    });
    expect(getConditionFromUca(uca)).toBe('tool provides malicious input');
  });

  it('handles NOT_PROVIDED', () => {
    const uca = makeUca({ type: UnsafeControlActionType.NOT_PROVIDED });
    expect(getConditionFromUca(uca)).toBe('required validation is not provided');
  });

  it('handles WRONG_TIMING', () => {
    const uca = makeUca({ type: UnsafeControlActionType.WRONG_TIMING });
    expect(getConditionFromUca(uca)).toBe('preconditions are not satisfied');
  });

  it('handles WRONG_DURATION', () => {
    const uca = makeUca({ type: UnsafeControlActionType.WRONG_DURATION });
    expect(getConditionFromUca(uca)).toBe('operation duration exceeds safe limits');
  });
});

// ============================================================================
// generateConstraintDescription
// ============================================================================

describe('generateConstraintDescription', () => {
  it('combines action, condition, and category', () => {
    const hazard = makeHazard({ category: HazardCategory.DATA_LOSS });
    const uca = makeUca({
      type: UnsafeControlActionType.PROVIDED_CAUSES_HAZARD,
      unsafeContext: 'unvalidated path',
    });
    const result = generateConstraintDescription(hazard, uca, ConstraintEnforcement.PREVENT);
    expect(result).toBe(
      'Block tool invocation when tool provides unvalidated path to prevent data loss'
    );
  });

  it('replaces underscores in category', () => {
    const hazard = makeHazard({ category: HazardCategory.PRIVILEGE_ESCALATION });
    const uca = makeUca({ type: UnsafeControlActionType.NOT_PROVIDED });
    const result = generateConstraintDescription(hazard, uca, ConstraintEnforcement.ALERT);
    expect(result).toContain('privilege escalation');
  });
});

// ============================================================================
// generateValidationFunctionName
// ============================================================================

describe('generateValidationFunctionName', () => {
  it('generates function name from category', () => {
    expect(generateValidationFunctionName(HazardCategory.DATA_LOSS)).toBe('validateDataloss');
  });

  it('handles multi-word categories', () => {
    const name = generateValidationFunctionName(HazardCategory.PRIVILEGE_ESCALATION);
    expect(name).toBe('validatePrivilegeescalation');
  });
});

// ============================================================================
// findHazardInteractions
// ============================================================================

describe('findHazardInteractions', () => {
  it('returns empty for no tools', () => {
    expect(findHazardInteractions([])).toEqual([]);
  });

  it('returns empty for single tool', () => {
    const results = [makeToolResult()];
    expect(findHazardInteractions(results)).toEqual([]);
  });

  it('detects privilege escalation + execution combination', () => {
    const results = [
      makeToolResult({
        toolName: 'admin_tool',
        hazards: [makeHazard({ category: HazardCategory.PRIVILEGE_ESCALATION })],
      }),
      makeToolResult({
        toolName: 'exec_tool',
        hazards: [makeHazard({ category: HazardCategory.UNAUTHORIZED_EXECUTION })],
      }),
    ];
    const interactions = findHazardInteractions(results);
    expect(interactions).toHaveLength(1);
    expect(interactions[0]!.severity).toBe(HazardSeverity.CRITICAL);
    expect(interactions[0]!.involvedTools).toContain('admin_tool');
    expect(interactions[0]!.involvedTools).toContain('exec_tool');
  });

  it('returns empty when no dangerous combinations', () => {
    const results = [
      makeToolResult({
        toolName: 'tool1',
        hazards: [makeHazard({ category: HazardCategory.DATA_LOSS })],
      }),
      makeToolResult({
        toolName: 'tool2',
        hazards: [makeHazard({ category: HazardCategory.DATA_LOSS })],
      }),
    ];
    expect(findHazardInteractions(results)).toEqual([]);
  });
});

// ============================================================================
// generateSummary
// ============================================================================

describe('generateSummary', () => {
  it('returns zeros for empty input', () => {
    const summary = generateSummary([]);
    expect(summary.totalTools).toBe(0);
    expect(summary.totalHazards).toBe(0);
    expect(summary.totalUnsafeControlActions).toBe(0);
    expect(summary.totalSafetyConstraints).toBe(0);
    expect(summary.averageRiskScore).toBe(0);
  });

  it('counts totals correctly', () => {
    const results = [
      makeToolResult({
        hazards: [makeHazard(), makeHazard({ id: 'H-002' })],
        unsafeControlActions: [makeUca()],
        safetyConstraints: [
          {
            id: 'SC-001',
            description: 'test',
            mitigates: ['UCA-001'],
            enforcement: ConstraintEnforcement.PREVENT,
            priority: ConstraintPriority.HIGH,
          },
        ],
        riskScore: 60,
        riskLevel: RiskLevel.MODERATE,
      }),
      makeToolResult({
        hazards: [makeHazard({ id: 'H-003', category: HazardCategory.INJECTION })],
        unsafeControlActions: [],
        safetyConstraints: [],
        riskScore: 40,
        riskLevel: RiskLevel.LOW,
      }),
    ];
    const summary = generateSummary(results);
    expect(summary.totalTools).toBe(2);
    expect(summary.totalHazards).toBe(3);
    expect(summary.totalUnsafeControlActions).toBe(1);
    expect(summary.totalSafetyConstraints).toBe(1);
    expect(summary.averageRiskScore).toBe(50);
  });

  it('counts hazards by category', () => {
    const results = [
      makeToolResult({
        hazards: [
          makeHazard({ category: HazardCategory.DATA_LOSS }),
          makeHazard({ id: 'H-002', category: HazardCategory.DATA_LOSS }),
          makeHazard({ id: 'H-003', category: HazardCategory.INJECTION }),
        ],
      }),
    ];
    const summary = generateSummary(results);
    expect(summary.hazardsByCategory[HazardCategory.DATA_LOSS]).toBe(2);
    expect(summary.hazardsByCategory[HazardCategory.INJECTION]).toBe(1);
    expect(summary.hazardsByCategory[HazardCategory.RESOURCE_EXHAUSTION]).toBe(0);
  });

  it('counts tools by risk level', () => {
    const results = [
      makeToolResult({ riskLevel: RiskLevel.HIGH }),
      makeToolResult({ riskLevel: RiskLevel.HIGH }),
      makeToolResult({ riskLevel: RiskLevel.LOW }),
    ];
    const summary = generateSummary(results);
    expect(summary.toolsByRiskLevel[RiskLevel.HIGH]).toBe(2);
    expect(summary.toolsByRiskLevel[RiskLevel.LOW]).toBe(1);
    expect(summary.toolsByRiskLevel[RiskLevel.MINIMAL]).toBe(0);
  });
});
