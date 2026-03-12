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
  buildCodePrompt,
  buildTestingPrompt,
  buildDocumentationPrompt,
  buildPmPrompt,
  buildUxPrompt,
  buildInfrastructurePrompt,
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

// ============================================================================
// New Enriched Prompt Builders (Phase 1 — #1300)
// ============================================================================

describe('buildCodePrompt', () => {
  it('includes the base prompt', () => {
    const result = buildCodePrompt('You are a code expert.');
    expect(result).toContain('You are a code expert.');
  });

  it('appends code domain knowledge', () => {
    const result = buildCodePrompt('base');
    expect(result.length).toBeGreaterThan('base'.length);
  });

  it('separates base and knowledge with newlines', () => {
    const result = buildCodePrompt('base');
    expect(result).toMatch(/^base\n\n/);
  });
});

describe('buildTestingPrompt', () => {
  it('includes the base prompt', () => {
    const result = buildTestingPrompt('You are a testing expert.');
    expect(result).toContain('You are a testing expert.');
  });

  it('appends testing domain knowledge', () => {
    const result = buildTestingPrompt('base');
    expect(result.length).toBeGreaterThan('base'.length);
  });

  it('separates base and knowledge with newlines', () => {
    const result = buildTestingPrompt('base');
    expect(result).toMatch(/^base\n\n/);
  });
});

describe('buildDocumentationPrompt', () => {
  it('includes the base prompt', () => {
    const result = buildDocumentationPrompt('You are a docs expert.');
    expect(result).toContain('You are a docs expert.');
  });

  it('appends documentation domain knowledge', () => {
    const result = buildDocumentationPrompt('base');
    expect(result.length).toBeGreaterThan('base'.length);
  });

  it('separates base and knowledge with newlines', () => {
    const result = buildDocumentationPrompt('base');
    expect(result).toMatch(/^base\n\n/);
  });
});

describe('buildPmPrompt', () => {
  it('includes the base prompt', () => {
    const result = buildPmPrompt('You are a PM expert.');
    expect(result).toContain('You are a PM expert.');
  });

  it('appends PM domain knowledge', () => {
    const result = buildPmPrompt('base');
    expect(result).toContain('PM Domain Knowledge');
  });

  it('includes requirements engineering knowledge', () => {
    const result = buildPmPrompt('base');
    expect(result).toContain('INVEST');
  });
});

describe('buildUxPrompt', () => {
  it('includes the base prompt', () => {
    const result = buildUxPrompt('You are a UX expert.');
    expect(result).toContain('You are a UX expert.');
  });

  it('appends UX domain knowledge', () => {
    const result = buildUxPrompt('base');
    expect(result).toContain('UX Domain Knowledge');
  });

  it('includes usability heuristics', () => {
    const result = buildUxPrompt('base');
    expect(result).toContain('Nielsen');
  });

  it('includes dark mode knowledge', () => {
    const result = buildUxPrompt('base');
    expect(result).toContain('Dark Mode');
    expect(result).toContain('localStorage');
  });

  it('includes visualization library selection knowledge', () => {
    const result = buildUxPrompt('base');
    expect(result).toContain('Visualization Library Selection');
    expect(result).toContain('CSP-safe');
  });

  it('includes typography and fonts knowledge', () => {
    const result = buildUxPrompt('base');
    expect(result).toContain('Typography & Fonts');
    expect(result).toContain('font-display: swap');
  });
});

describe('buildInfrastructurePrompt', () => {
  it('includes the base prompt', () => {
    const result = buildInfrastructurePrompt('You are an infra expert.');
    expect(result).toContain('You are an infra expert.');
  });

  it('appends infrastructure domain knowledge', () => {
    const result = buildInfrastructurePrompt('base');
    expect(result).toContain('Infrastructure Domain Knowledge');
  });

  it('includes hardware lifecycle knowledge', () => {
    const result = buildInfrastructurePrompt('base');
    expect(result).toContain('SMART');
  });
});
