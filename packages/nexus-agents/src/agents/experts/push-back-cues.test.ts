/**
 * Tests for Push-Back Cues section presence (Issue #1865).
 *
 * Every expert prompt must include explicit guidance on when to
 * refuse, push back, or escalate instead of compliant answering.
 * Code + architecture express this in their shared core (#1867);
 * the other 7 experts express it in a dedicated section.
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

const EXPERTS: Array<[string, string]> = [
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

describe.each(EXPERTS)('Expert %s has Push-Back Cues section', (_name, prompt) => {
  it('includes a Push-Back Cues heading', () => {
    expect(prompt).toContain('Push-Back Cues');
  });

  it('mentions confidence threshold guidance', () => {
    // All push-back sections include a "confidence <0.x" cue
    expect(prompt).toMatch(/[Cc]onfidence <0\.\d/);
  });
});

// Spot-check the most actionable cue per expert
describe('Expert-specific push-back cues', () => {
  it('pm recommends spike when requirements vague after 3 rounds', () => {
    expect(PM_EXPERT_BASE_PROMPT).toContain('3 clarification rounds');
    expect(PM_EXPERT_BASE_PROMPT).toContain('spike');
  });

  it('research checks for newer work on >3-yo papers', () => {
    expect(RESEARCH_EXPERT_BASE_PROMPT).toContain('more than 3 years old');
  });

  it('testing recommends happy + 1 critical for >10 edge case targets', () => {
    expect(TESTING_EXPERT_BASE_PROMPT).toContain('>10 edge cases');
    expect(TESTING_EXPERT_BASE_PROMPT).toContain('happy path + 1 critical');
  });

  it('documentation refuses to document non-existent features', () => {
    expect(DOCUMENTATION_EXPERT_BASE_PROMPT).toContain("feature that doesn't exist in code");
  });

  it('security refuses to assert no-vuln by default', () => {
    expect(SECURITY_EXPERT_BASE_PROMPT).toContain('never assert "no vulnerability" by default');
  });

  it('infrastructure refuses untrusted-OOB power cycles', () => {
    expect(INFRASTRUCTURE_EXPERT_BASE_PROMPT).toContain('power-cycle without verified OOB');
  });

  it('data-viz refuses single-chart for >3 dimensions', () => {
    expect(DATA_VISUALIZATION_EXPERT_BASE_PROMPT).toContain('more than 3 dimensions');
  });

  it('code asks for scope clarification on multi-callsite refactors', () => {
    expect(CODE_EXPERT_BASE_PROMPT).toContain('refactor would break >1 call site');
  });

  it('architecture pushes back on canonical-path contradictions', () => {
    expect(ARCHITECTURE_EXPERT_BASE_PROMPT).toContain('request contradicts canonical paths');
  });
});
