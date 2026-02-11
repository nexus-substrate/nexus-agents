/**
 * Tests for UX Expert Design System Generation (Epic #946)
 *
 * Validates the UX expert prompt includes design system generation
 * capabilities, pre-delivery checklist, security guidance, and
 * expanded domain expertise.
 *
 * @module agents/experts/ux-expert-design.test
 */

import { describe, it, expect } from 'vitest';
import { UX_EXPERT_BASE_PROMPT } from './expert-prompts/ux-expert.js';

// ============================================================================
// UX Expert Prompt — Design System Generation
// ============================================================================

describe('UX Expert Design System Generation', () => {
  it('includes the Design System Generation section', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('## Design System Generation');
  });

  it('includes the 4-step design workflow', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('Analyze requirements');
    expect(UX_EXPERT_BASE_PROMPT).toContain('design system');
    expect(UX_EXPERT_BASE_PROMPT).toContain('industry-specific reasoning');
    expect(UX_EXPERT_BASE_PROMPT).toContain('stack-aware');
  });

  it('includes designSystem output schema', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('"designSystem"');
    expect(UX_EXPERT_BASE_PROMPT).toContain('"pattern"');
    expect(UX_EXPERT_BASE_PROMPT).toContain('"style"');
    expect(UX_EXPERT_BASE_PROMPT).toContain('"colors"');
    expect(UX_EXPERT_BASE_PROMPT).toContain('"typography"');
    expect(UX_EXPERT_BASE_PROMPT).toContain('"components"');
    expect(UX_EXPERT_BASE_PROMPT).toContain('"antiPatterns"');
  });
});

// ============================================================================
// UX Expert Prompt — Pre-Delivery Checklist
// ============================================================================

describe('UX Expert Pre-Delivery Checklist', () => {
  it('prohibits emoji icons', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('No emoji icons');
  });

  it('requires cursor-pointer on interactive elements', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('cursor-pointer');
  });

  it('requires hover/focus states with transitions', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('150-300ms');
  });

  it('enforces WCAG AA color contrast', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('4.5:1');
    expect(UX_EXPERT_BASE_PROMPT).toContain('WCAG AA');
  });

  it('specifies responsive breakpoints', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('375px');
    expect(UX_EXPERT_BASE_PROMPT).toContain('768px');
    expect(UX_EXPERT_BASE_PROMPT).toContain('1024px');
    expect(UX_EXPERT_BASE_PROMPT).toContain('1440px');
  });

  it('requires motion safety', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('prefers-reduced-motion');
  });
});

// ============================================================================
// UX Expert Prompt — Security Guidance
// ============================================================================

describe('UX Expert Security Guidance', () => {
  it('includes XSS prevention', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('innerHTML');
    expect(UX_EXPERT_BASE_PROMPT).toContain('XSS');
  });

  it('lists security-aware frontend code generation in expertise', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('Security-aware frontend code generation');
  });
});

// ============================================================================
// UX Expert Prompt — Domain Expertise
// ============================================================================

describe('UX Expert Domain Expertise', () => {
  const requiredDomains = [
    'User research',
    'Information architecture',
    'Interaction design',
    'Accessibility standards',
    'Usability testing',
    'Design system generation',
    'Color theory',
    'CLI and TUI',
    'API developer experience',
  ];

  for (const domain of requiredDomains) {
    it(`includes ${domain}`, () => {
      expect(UX_EXPERT_BASE_PROMPT).toContain(domain);
    });
  }
});

// ============================================================================
// UX Expert Prompt — Backward Compatibility
// ============================================================================

describe('UX Expert Backward Compatibility', () => {
  it('retains original Core Principles', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('## Core Principles');
    expect(UX_EXPERT_BASE_PROMPT).toContain('Advocate for the user');
  });

  it('retains UX Analysis Framework', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('## UX Analysis Framework');
    expect(UX_EXPERT_BASE_PROMPT).toContain('Usability');
    expect(UX_EXPERT_BASE_PROMPT).toContain('Learnability');
  });

  it('retains Interaction Design Patterns', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('Progressive disclosure');
    expect(UX_EXPERT_BASE_PROMPT).toContain('Sensible defaults');
  });

  it('retains original Output Format', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('"findings"');
    expect(UX_EXPERT_BASE_PROMPT).toContain('"userJourney"');
    expect(UX_EXPERT_BASE_PROMPT).toContain('"recommendations"');
    expect(UX_EXPERT_BASE_PROMPT).toContain('"confidence"');
  });
});
