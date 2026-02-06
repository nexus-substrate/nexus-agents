/**
 * Tests for Enriched Expert Prompts
 *
 * @module agents/experts/enriched-prompts.test
 */

import { describe, it, expect } from 'vitest';
import {
  buildArchitecturePrompt,
  buildSecurityPrompt,
  buildDevOpsPrompt,
  buildResearchPrompt,
} from './enriched-prompts.js';

// ============================================================================
// Enriched Prompt Builders
// ============================================================================

describe('buildArchitecturePrompt', () => {
  it('includes the base prompt', () => {
    const result = buildArchitecturePrompt('You are an architecture expert.');
    expect(result).toContain('You are an architecture expert.');
  });

  it('appends architecture knowledge', () => {
    const result = buildArchitecturePrompt('base prompt');
    expect(result.length).toBeGreaterThan('base prompt'.length);
  });

  it('separates base and knowledge with newlines', () => {
    const result = buildArchitecturePrompt('base');
    expect(result).toMatch(/^base\n\n/);
  });
});

describe('buildSecurityPrompt', () => {
  it('includes the base prompt', () => {
    const result = buildSecurityPrompt('You are a security expert.');
    expect(result).toContain('You are a security expert.');
  });

  it('appends security knowledge', () => {
    const result = buildSecurityPrompt('base');
    expect(result.length).toBeGreaterThan('base'.length);
  });
});

describe('buildDevOpsPrompt', () => {
  it('includes the base prompt', () => {
    const result = buildDevOpsPrompt('You are a DevOps expert.');
    expect(result).toContain('You are a DevOps expert.');
  });

  it('appends devops knowledge', () => {
    const result = buildDevOpsPrompt('base');
    expect(result.length).toBeGreaterThan('base'.length);
  });
});

describe('buildResearchPrompt', () => {
  it('includes the base prompt', () => {
    const result = buildResearchPrompt('You are a research expert.');
    expect(result).toContain('You are a research expert.');
  });

  it('appends research knowledge', () => {
    const result = buildResearchPrompt('base');
    expect(result.length).toBeGreaterThan('base'.length);
  });
});
