/**
 * Tests for Anti-Pattern Prohibitions section presence (Issue #1864).
 *
 * Every expert prompt must include explicit prohibitions against
 * default-reflex mistakes, modeled on ux-expert's "Anti-AI-Slop
 * Prohibitions" section. This anchors the prompt in domain
 * judgment rather than blanket compliance.
 */

import { describe, it, expect } from 'vitest';
import { CODE_EXPERT_BASE_PROMPT } from './expert-prompts/code-expert.js';
import { ARCHITECTURE_EXPERT_BASE_PROMPT } from './expert-prompts/architecture-expert.js';
import { DATA_VISUALIZATION_EXPERT_BASE_PROMPT } from './expert-prompts/data-visualization-expert.js';
import { DOCUMENTATION_EXPERT_BASE_PROMPT } from './expert-prompts/documentation-expert.js';
import { INFRASTRUCTURE_EXPERT_BASE_PROMPT } from './expert-prompts/infrastructure-expert.js';
import { PM_EXPERT_BASE_PROMPT } from './expert-prompts/pm-expert.js';
import { RESEARCH_EXPERT_BASE_PROMPT } from './expert-prompts/research-expert.js';
import { SECURITY_EXPERT_BASE_PROMPT } from './expert-prompts/security-expert.js';
import { TESTING_EXPERT_BASE_PROMPT } from './expert-prompts/testing-expert.js';
import { UX_EXPERT_CREATIVE_PROMPT } from './expert-prompts/ux-expert.js';

const EXPERTS_WITH_PROHIBITIONS: Array<[string, string]> = [
  ['code', CODE_EXPERT_BASE_PROMPT],
  ['architecture', ARCHITECTURE_EXPERT_BASE_PROMPT],
  ['data-visualization', DATA_VISUALIZATION_EXPERT_BASE_PROMPT],
  ['documentation', DOCUMENTATION_EXPERT_BASE_PROMPT],
  ['infrastructure', INFRASTRUCTURE_EXPERT_BASE_PROMPT],
  ['pm', PM_EXPERT_BASE_PROMPT],
  ['research', RESEARCH_EXPERT_BASE_PROMPT],
  ['security', SECURITY_EXPERT_BASE_PROMPT],
  ['testing', TESTING_EXPERT_BASE_PROMPT],
];

describe.each(EXPERTS_WITH_PROHIBITIONS)(
  'Expert %s has Anti-Pattern Prohibitions section',
  (_name, prompt) => {
    it('includes an Anti-Pattern Prohibitions heading', () => {
      expect(prompt).toContain('Anti-Pattern Prohibitions');
    });
  }
);

// UX uses a different name for the same idea — verify it has one.
describe('UX creative mode uses Anti-AI-Slop Prohibitions', () => {
  it('includes the equivalent prohibitions section', () => {
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('Anti-AI-Slop Prohibitions');
  });
});

// Spot-check a representative prohibition per expert
describe('Expert-specific anti-pattern content', () => {
  it('data-viz forbids default bar charts', () => {
    expect(DATA_VISUALIZATION_EXPERT_BASE_PROMPT).toContain('No default bar chart');
  });

  it('documentation forbids inventing new doc types', () => {
    expect(DOCUMENTATION_EXPERT_BASE_PROMPT).toContain('Do NOT invent new doc types');
  });

  it('infrastructure forbids "just SSH in"', () => {
    expect(INFRASTRUCTURE_EXPERT_BASE_PROMPT).toContain('just SSH in');
  });

  it('pm forbids P1 features for what-if scenarios', () => {
    expect(PM_EXPERT_BASE_PROMPT).toContain('No P1 features for "what if" scenarios');
  });

  it('research forbids X-years-of-research without citations', () => {
    expect(RESEARCH_EXPERT_BASE_PROMPT).toContain('No "X years of research show"');
  });

  it('security forbids security-through-obscurity', () => {
    expect(SECURITY_EXPERT_BASE_PROMPT).toContain('No security-through-obscurity');
  });

  it('testing forbids tests for nonexistent code', () => {
    expect(TESTING_EXPERT_BASE_PROMPT).toContain("No tests for code that doesn't exist yet");
  });

  it('code forbids premature generalization', () => {
    expect(CODE_EXPERT_BASE_PROMPT).toContain('No premature generalization');
  });

  it('architecture forbids factory-for-one', () => {
    expect(ARCHITECTURE_EXPERT_BASE_PROMPT).toContain('factory pattern for single-use objects');
  });
});
