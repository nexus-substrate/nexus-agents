/**
 * Tests for flexible output format across experts (Issue #1863).
 *
 * Code, architecture, and testing experts should prioritize running
 * code over forced JSON structure when the task is generation-shaped.
 * Code + architecture express this via mode split (generate/design).
 * Testing expresses it via dual-output language in a single prompt.
 *
 * Security and data-visualization already handled this well — they
 * serve as the pattern source.
 */

import { describe, it, expect } from 'vitest';
import { CODE_EXPERT_GENERATE_PROMPT } from './expert-prompts/code-expert.js';
import { ARCHITECTURE_EXPERT_DESIGN_PROMPT } from './expert-prompts/architecture-expert.js';
import { TESTING_EXPERT_BASE_PROMPT } from './expert-prompts/testing-expert.js';

describe('Code generate mode prefers running code over JSON', () => {
  it('announces flexible output', () => {
    expect(CODE_EXPERT_GENERATE_PROMPT).toContain('Output Format (flexible)');
  });

  it('marks JSON as optional for programmatic consumers only', () => {
    expect(CODE_EXPERT_GENERATE_PROMPT).toContain(
      'Only use JSON output if the caller is a programmatic consumer'
    );
  });
});

describe('Architecture design mode prefers narrative over JSON', () => {
  it('announces flexible output', () => {
    expect(ARCHITECTURE_EXPERT_DESIGN_PROMPT).toContain('Output Format (flexible)');
  });

  it('marks JSON as optional for programmatic callers', () => {
    expect(ARCHITECTURE_EXPERT_DESIGN_PROMPT).toContain(
      'JSON output optional, use only if the caller is programmatic'
    );
  });
});

describe('Testing expert output is flexible by default', () => {
  it('defaults to running test code in fenced blocks', () => {
    expect(TESTING_EXPERT_BASE_PROMPT).toContain('Default: flexible output');
    expect(TESTING_EXPERT_BASE_PROMPT).toContain('runnable test code in fenced code blocks');
  });

  it('marks JSON structure as optional for programmatic consumers', () => {
    expect(TESTING_EXPERT_BASE_PROMPT).toContain(
      'Use JSON structure only when the caller is a programmatic consumer'
    );
  });

  it('retains the JSON schema for programmatic callers', () => {
    expect(TESTING_EXPERT_BASE_PROMPT).toContain('"operationType"');
    expect(TESTING_EXPERT_BASE_PROMPT).toContain('"tests"');
    expect(TESTING_EXPERT_BASE_PROMPT).toContain('"coverage"');
  });
});
