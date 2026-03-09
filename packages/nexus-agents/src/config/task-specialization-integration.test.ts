/**
 * Integration tests for Task Specialization with delegate-to-model scoring.
 *
 * Verifies that the specialization matrix influences model selection
 * through the scoring pipeline.
 *
 * (Source: Issue #858 — Multi-model task specialization)
 */

import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import {
  calcSpecializationBonus,
  getCliForModel,
  scoreModel,
  selectModel,
  buildReasons,
} from '../mcp/tools/delegate-to-model-helpers.js';
import { MODEL_CAPABILITIES } from '../mcp/tools/delegate-to-model-types.js';
import type { TaskRequirements } from '../mcp/tools/delegate-to-model-types.js';
import { detectTaskCategory } from './task-specialization.js';
import { resetOutcomeStore } from '../orchestration/outcomes/index.js';

// Disable persistence so calcSpecializationBonus tests get clean outcome store
let savedPersist: string | undefined;
beforeAll(() => {
  savedPersist = process.env['NEXUS_PERSIST_LEARNING'];
  process.env['NEXUS_PERSIST_LEARNING'] = 'false';
  resetOutcomeStore();
});
afterAll(() => {
  if (savedPersist !== undefined) {
    process.env['NEXUS_PERSIST_LEARNING'] = savedPersist;
  } else {
    delete process.env['NEXUS_PERSIST_LEARNING'];
  }
  resetOutcomeStore();
});

function makeReq(overrides: Partial<TaskRequirements> = {}): TaskRequirements {
  return {
    estimatedTokens: 500,
    needsReasoning: false,
    needsLargeContext: false,
    needsSpeed: false,
    needsCodeGen: false,
    isCostSensitive: false,
    needsImageGen: false,
    needsAudioOutput: false,
    needsMcp: false,
    needsExploration: false,
    ...overrides,
  };
}

// ============================================================================
// getCliForModel
// ============================================================================

describe('getCliForModel', () => {
  it('returns claude for claude-opus', () => {
    expect(getCliForModel('claude-opus')).toBe('claude');
  });

  it('returns codex for codex-5.3', () => {
    expect(getCliForModel('codex-5.3')).toBe('codex');
  });

  it('returns gemini for gemini-pro', () => {
    expect(getCliForModel('gemini-pro')).toBe('gemini');
  });

  it('returns undefined for unknown model', () => {
    expect(getCliForModel('unknown-model')).toBeUndefined();
  });
});

// ============================================================================
// calcSpecializationBonus
// ============================================================================

describe('calcSpecializationBonus', () => {
  beforeEach(() => {
    resetOutcomeStore();
  });

  it('returns full bonus for primary CLI match', () => {
    const match = detectTaskCategory('Design the system architecture');
    expect(match).not.toBeNull();
    // architecture → claude primary, bonus=10
    const bonus = calcSpecializationBonus('claude-opus', match);
    expect(bonus).toBe(10);
  });

  it('returns half bonus for secondary CLI match', () => {
    const match = detectTaskCategory('Design the system architecture');
    // architecture → gemini secondary, bonus=10
    const bonus = calcSpecializationBonus('gemini-pro', match);
    expect(bonus).toBe(5); // floor(10/2)
  });

  it('returns 0 for non-matching CLI', () => {
    const match = detectTaskCategory('Design the system architecture');
    // architecture → claude primary, gemini secondary, codex neither
    const bonus = calcSpecializationBonus('codex-5.3', match);
    expect(bonus).toBe(0);
  });

  it('returns 0 when no specialization match', () => {
    expect(calcSpecializationBonus('claude-opus', null)).toBe(0);
  });

  it('returns full bonus=15 for code_review + codex (#1454)', () => {
    const match = detectTaskCategory('Review the pull request code');
    expect(match).not.toBeNull();
    // code_review → codex primary, bonus=15
    const bonus = calcSpecializationBonus('codex-5.3', match);
    expect(bonus).toBe(15);
  });

  it('returns half bonus=7 for code_review + claude (#1454)', () => {
    const match = detectTaskCategory('Review the pull request code');
    // code_review → claude secondary, bonus=15 → floor(15/2)=7
    const bonus = calcSpecializationBonus('claude-opus', match);
    expect(bonus).toBe(7);
  });
});

// ============================================================================
// scoreModel with specialization
// ============================================================================

describe('scoreModel with specialization', () => {
  it('boosts claude for architecture tasks', () => {
    const match = detectTaskCategory('Architect the new payment system');
    const opus = MODEL_CAPABILITIES['claude-opus']!;
    const codex = MODEL_CAPABILITIES['codex-5.3']!;
    const req = makeReq();

    const opusScore = scoreModel('claude-opus', opus, req, {
      billingMode: 'plan',
      specialization: match,
    });
    const codexScore = scoreModel('codex-5.3', codex, req, {
      billingMode: 'plan',
      specialization: match,
    });

    // Claude should get full 10pt bonus, codex gets 0 (not primary/secondary)
    expect(opusScore).toBeGreaterThan(codexScore);
  });

  it('boosts codex for code generation tasks', () => {
    const match = detectTaskCategory('Implement user login feature');
    const codex = MODEL_CAPABILITIES['codex-5.3']!;
    const gemini = MODEL_CAPABILITIES['gemini-pro']!;
    const req = makeReq();

    const codexScore = scoreModel('codex-5.3', codex, req, {
      billingMode: 'plan',
      specialization: match,
    });
    const geminiScore = scoreModel('gemini-pro', gemini, req, {
      billingMode: 'plan',
      specialization: match,
    });

    expect(codexScore).toBeGreaterThan(geminiScore);
  });

  it('boosts gemini for research tasks', () => {
    const match = detectTaskCategory('Research best practices for auth');
    const gemini = MODEL_CAPABILITIES['gemini-pro']!;
    const req = makeReq();

    const withSpec = scoreModel('gemini-pro', gemini, req, {
      billingMode: 'plan',
      specialization: match,
    });
    const withoutSpec = scoreModel('gemini-pro', gemini, req, { billingMode: 'plan' });

    expect(withSpec).toBeGreaterThan(withoutSpec);
  });
});

// ============================================================================
// buildReasons with specialization
// ============================================================================

describe('buildReasons with specialization', () => {
  it('includes specialization in reasons', () => {
    const match = detectTaskCategory('Architect the auth system');
    const reasons = buildReasons(makeReq(), undefined, 'api', match);
    expect(reasons.some((r) => r.includes('architecture'))).toBe(true);
    expect(reasons.some((r) => r.includes('claude'))).toBe(true);
  });

  it('omits specialization when no match', () => {
    const reasons = buildReasons(makeReq(), undefined, 'api', null);
    expect(reasons.every((r) => !r.includes('task (prefer'))).toBe(true);
  });
});

// ============================================================================
// selectModel with specialization
// ============================================================================

describe('selectModel with specialization integration', () => {
  it('includes specialization in reasoning output', () => {
    const input = { task: 'Design the system architecture', estimate_tokens: false };
    const req = makeReq({ needsReasoning: true });
    const result = selectModel(input, req, 'plan');
    expect(result.reasoning).toContain('architecture');
  });

  it('prefers codex for implementation tasks', () => {
    const input = { task: 'Implement the API endpoint', estimate_tokens: false };
    const req = makeReq({ needsCodeGen: true });
    const result = selectModel(input, req, 'plan');
    // codex-5.3 should be selected (code generation + specialization)
    expect(result.model).toContain('codex');
  });
});
