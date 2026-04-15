/**
 * Tests for Task Scope Management section presence (Issue #1866).
 *
 * Code, architecture, testing, security, infrastructure already had
 * task-scope guidance. This test verifies the four remaining experts
 * (data-viz, documentation, pm, research) now also have it.
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

describe.each(EXPERTS)('Expert %s has Task Scope Management section', (_name, prompt) => {
  it('includes a Task Scope Management heading', () => {
    expect(prompt).toContain('Task Scope Management');
  });
});

describe('Expert-specific scope rules', () => {
  it('pm focuses on the 3 highest-impact P1 when >5', () => {
    expect(PM_EXPERT_BASE_PROMPT).toContain('>5 P1 requirements');
    expect(PM_EXPERT_BASE_PROMPT).toContain('3 with highest business impact');
  });

  it('research caps discovery at 10 sources', () => {
    expect(RESEARCH_EXPERT_BASE_PROMPT).toContain('max 10 sources per query');
  });

  it('documentation prioritizes Tier 1 when >5 docs', () => {
    expect(DOCUMENTATION_EXPERT_BASE_PROMPT).toContain('>5 docs');
    expect(DOCUMENTATION_EXPERT_BASE_PROMPT).toContain('Tier 1');
  });

  it('data-viz groups >8 datasets into 2-3 dashboards', () => {
    expect(DATA_VISUALIZATION_EXPERT_BASE_PROMPT).toContain('>8 datasets');
    expect(DATA_VISUALIZATION_EXPERT_BASE_PROMPT).toContain('2-3 cohesive dashboards');
  });
});
