/**
 * Tests for Reference Implementation section presence (Issue #1862).
 *
 * Every expert prompt must include a `Reference Implementation` section
 * citing concrete files / modules / documents in this codebase so the
 * agent's recommendations are anchored to real prior art, not generic
 * patterns it might apply to any codebase.
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

describe.each(EXPERTS)('Expert %s has Reference Implementation section', (_name, prompt) => {
  it('includes a Reference Implementation heading', () => {
    expect(prompt).toContain('Reference Implementation');
  });

  it('cites at least one concrete repo path', () => {
    // Any of: src/, docs/, packages/, or .rules/
    expect(prompt).toMatch(/`(src\/|docs\/|packages\/|\.claude\/|agents\/|CLAUDE\.md)/);
  });
});

// Specific cites per expert — verify the canonical files actually appear
describe('Expert-specific reference cites', () => {
  it('code cites unified-registry and Result<T,E>', () => {
    expect(CODE_EXPERT_BASE_PROMPT).toContain('src/adapters/unified-registry.ts');
    expect(CODE_EXPERT_BASE_PROMPT).toContain('Result<T, E>');
  });

  it('architecture cites adapter + graph + pipeline primitives', () => {
    expect(ARCHITECTURE_EXPERT_BASE_PROMPT).toContain('unified-registry.ts');
    expect(ARCHITECTURE_EXPERT_BASE_PROMPT).toContain('graph-builder.ts');
    expect(ARCHITECTURE_EXPERT_BASE_PROMPT).toContain('pipeline-runner.ts');
  });

  it('data-visualization cites EXECUTION_DASHBOARD_DESIGN', () => {
    expect(DATA_VISUALIZATION_EXPERT_BASE_PROMPT).toContain('EXECUTION_DASHBOARD_DESIGN');
  });

  it('documentation cites docs/README.md canonical index', () => {
    expect(DOCUMENTATION_EXPERT_BASE_PROMPT).toContain('docs/README.md');
    expect(DOCUMENTATION_EXPERT_BASE_PROMPT).toContain('SECURITY.md');
  });

  it('infrastructure cites SECURITY.md + MCP_PROTOCOL', () => {
    expect(INFRASTRUCTURE_EXPERT_BASE_PROMPT).toContain('SECURITY.md');
    expect(INFRASTRUCTURE_EXPERT_BASE_PROMPT).toContain('MCP_PROTOCOL.md');
  });

  it('pm cites an exemplar epic + canonical paths', () => {
    expect(PM_EXPERT_BASE_PROMPT).toContain('#1860');
    expect(PM_EXPERT_BASE_PROMPT).toContain('Canonical Paths');
  });

  it('research cites RESEARCH_INDEX + RESEARCH_PIPELINE', () => {
    expect(RESEARCH_EXPERT_BASE_PROMPT).toContain('RESEARCH_INDEX.md');
    expect(RESEARCH_EXPERT_BASE_PROMPT).toContain('RESEARCH_PIPELINE.md');
  });

  it('security cites test-secrets + UNTRUSTED_INPUT_HARDENING', () => {
    expect(SECURITY_EXPERT_BASE_PROMPT).toContain('test-secrets.ts');
    expect(SECURITY_EXPERT_BASE_PROMPT).toContain('UNTRUSTED_INPUT_HARDENING.md');
  });

  it('testing cites prompt-composer.test.ts + describe.each template', () => {
    expect(TESTING_EXPERT_BASE_PROMPT).toContain('prompt-composer.test.ts');
    expect(TESTING_EXPERT_BASE_PROMPT).toContain('code-architecture-mode-split.test.ts');
  });
});
