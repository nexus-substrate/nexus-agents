/**
 * nexus-agents/agents - Reflexion Types Tests
 *
 * Tests for Multi-Agent Reflexion (MAR) types and utilities.
 * (Source: arxiv:2512.20845)
 */

import { describe, it, expect } from 'vitest';
import {
  PersonaSchema,
  PersonaCritiqueSchema,
  DebateResultSchema,
  ReflexionConfigSchema,
  ReflexionResultSchema,
  DEFAULT_CODE_REVIEW_PERSONAS,
  calculateWeightedSeverity,
} from './reflexion-types.js';

describe('PersonaSchema', () => {
  it('should validate valid persona', () => {
    const persona = {
      id: 'test-persona',
      role: 'Test Reviewer',
      systemPrompt: 'You are a test reviewer.',
      focusAreas: ['testing', 'quality'],
      weight: 0.8,
    };
    expect(PersonaSchema.safeParse(persona).success).toBe(true);
  });

  it('should reject persona without required fields', () => {
    const invalid = { id: 'test' };
    expect(PersonaSchema.safeParse(invalid).success).toBe(false);
  });

  it('should reject weight outside 0-1 range', () => {
    const invalid = {
      id: 'test',
      role: 'Test',
      systemPrompt: 'Test',
      focusAreas: ['test'],
      weight: 1.5,
    };
    expect(PersonaSchema.safeParse(invalid).success).toBe(false);
  });

  it('should default weight to 1', () => {
    const persona = {
      id: 'test',
      role: 'Test',
      systemPrompt: 'Test',
      focusAreas: ['test'],
    };
    const result = PersonaSchema.safeParse(persona);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weight).toBe(1);
    }
  });
});

describe('PersonaCritiqueSchema', () => {
  it('should validate valid critique', () => {
    const critique = {
      personaId: 'devils-advocate',
      role: "Devil's Advocate",
      critique: 'Found potential edge case issues.',
      suggestedImprovement: 'Add null checks.',
      severity: 0.6,
      issues: ['Missing null check', 'Potential overflow'],
    };
    expect(PersonaCritiqueSchema.safeParse(critique).success).toBe(true);
  });

  it('should reject severity outside 0-1 range', () => {
    const invalid = {
      personaId: 'test',
      role: 'Test',
      critique: 'Test',
      suggestedImprovement: 'Test',
      severity: -0.1,
      issues: [],
    };
    expect(PersonaCritiqueSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('DebateResultSchema', () => {
  it('should validate valid debate result', () => {
    const result = {
      synthesizedReflection: 'Critics agree on security concerns.',
      consensusSeverity: 0.5,
      agreements: ['Security needs improvement'],
      disagreements: ['Documentation level'],
      actionItems: ['Add input validation', 'Update error handling'],
    };
    expect(DebateResultSchema.safeParse(result).success).toBe(true);
  });
});

describe('ReflexionConfigSchema', () => {
  it('should validate valid config', () => {
    const config = {
      maxIterations: 3,
      severityThreshold: 0.3,
      personas: DEFAULT_CODE_REVIEW_PERSONAS,
      iterationTimeoutMs: 60000,
      requireConsensus: false,
    };
    expect(ReflexionConfigSchema.safeParse(config).success).toBe(true);
  });

  it('should require at least 2 personas', () => {
    const invalid = {
      maxIterations: 3,
      severityThreshold: 0.3,
      personas: [DEFAULT_CODE_REVIEW_PERSONAS[0]],
      iterationTimeoutMs: 60000,
      requireConsensus: false,
    };
    expect(ReflexionConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('should limit maxIterations to 10', () => {
    const invalid = {
      maxIterations: 15,
      severityThreshold: 0.3,
      personas: DEFAULT_CODE_REVIEW_PERSONAS,
      iterationTimeoutMs: 60000,
      requireConsensus: false,
    };
    expect(ReflexionConfigSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('ReflexionResultSchema', () => {
  it('should validate valid result', () => {
    const result = {
      rounds: [],
      finalOutput: 'Improved code',
      totalIterations: 2,
      converged: true,
      terminationReason: 'converged',
      totalDurationMs: 5000,
    };
    expect(ReflexionResultSchema.safeParse(result).success).toBe(true);
  });

  it('should validate all termination reasons', () => {
    const reasons = ['converged', 'max_iterations', 'timeout', 'error'];
    for (const reason of reasons) {
      const result = {
        rounds: [],
        finalOutput: 'test',
        totalIterations: 1,
        converged: reason === 'converged',
        terminationReason: reason,
        totalDurationMs: 1000,
      };
      expect(ReflexionResultSchema.safeParse(result).success).toBe(true);
    }
  });
});

describe('DEFAULT_CODE_REVIEW_PERSONAS', () => {
  it('should have 3 personas', () => {
    expect(DEFAULT_CODE_REVIEW_PERSONAS).toHaveLength(3);
  });

  it('should include devils advocate, security, and maintainability critics', () => {
    const ids = DEFAULT_CODE_REVIEW_PERSONAS.map((p) => p.id);
    expect(ids).toContain('devils-advocate');
    expect(ids).toContain('security-critic');
    expect(ids).toContain('maintainability-critic');
  });

  it('should all be valid personas', () => {
    for (const persona of DEFAULT_CODE_REVIEW_PERSONAS) {
      expect(PersonaSchema.safeParse(persona).success).toBe(true);
    }
  });
});

describe('calculateWeightedSeverity', () => {
  const personas = DEFAULT_CODE_REVIEW_PERSONAS;

  it('should return 0 for empty critiques', () => {
    expect(calculateWeightedSeverity([], personas)).toBe(0);
  });

  it('should calculate simple average when all weights are 1', () => {
    const critiques = [
      {
        personaId: 'devils-advocate',
        role: 'DA',
        critique: '',
        suggestedImprovement: '',
        severity: 0.4,
        issues: [],
      },
      {
        personaId: 'security-critic',
        role: 'SC',
        critique: '',
        suggestedImprovement: '',
        severity: 0.6,
        issues: [],
      },
    ];
    // Both weights are 1.0, so average = (0.4 + 0.6) / 2 = 0.5
    expect(calculateWeightedSeverity(critiques, personas)).toBeCloseTo(0.5, 5);
  });

  it('should weight by persona weight', () => {
    const critiques = [
      {
        personaId: 'devils-advocate',
        role: 'DA',
        critique: '',
        suggestedImprovement: '',
        severity: 0.5,
        issues: [],
      },
      {
        personaId: 'maintainability-critic',
        role: 'MC',
        critique: '',
        suggestedImprovement: '',
        severity: 0.5,
        issues: [],
      },
    ];
    // devils-advocate weight=1.0, maintainability-critic weight=0.8
    // weighted = (0.5*1.0 + 0.5*0.8) / (1.0 + 0.8) = 0.9 / 1.8 = 0.5
    expect(calculateWeightedSeverity(critiques, personas)).toBeCloseTo(0.5, 5);
  });

  it('should use default weight of 1 for unknown personas', () => {
    const critiques = [
      {
        personaId: 'unknown',
        role: 'UK',
        critique: '',
        suggestedImprovement: '',
        severity: 0.8,
        issues: [],
      },
    ];
    expect(calculateWeightedSeverity(critiques, personas)).toBeCloseTo(0.8, 5);
  });
});
