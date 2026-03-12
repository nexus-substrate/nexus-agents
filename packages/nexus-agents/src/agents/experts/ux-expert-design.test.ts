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
  it('includes the Color System and M3 sections', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('## Color System: OKLCH Directives');
    expect(UX_EXPERT_BASE_PROMPT).toContain('## Material Design 3 (M3) Implementation');
  });

  it('includes design system output schema and M3 patterns', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('"designSystem"');
    expect(UX_EXPERT_BASE_PROMPT).toContain('tonal palettes');
    expect(UX_EXPERT_BASE_PROMPT).toContain('OKLCH');
    expect(UX_EXPERT_BASE_PROMPT).toContain('Material Design');
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
// UX Expert Prompt — Dark Mode Implementation (Issue #1539)
// ============================================================================

describe('UX Expert Dark Mode Implementation', () => {
  it('includes dark mode section', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('## Dark Mode Implementation');
  });

  it('specifies CSS-only baseline via prefers-color-scheme', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('prefers-color-scheme');
  });

  it('specifies .dark class with localStorage persistence', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('localStorage');
    expect(UX_EXPERT_BASE_PROMPT).toContain('.dark');
  });

  it('specifies OKLCH L-channel inversion for dark palettes', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('invert the L-channel');
  });
});

// ============================================================================
// UX Expert Prompt — Visualization Library Selection (Issue #1539)
// ============================================================================

describe('UX Expert Visualization Library Selection', () => {
  it('includes visualization section', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('## Visualization Library Selection');
  });

  it('covers CSS-only chart option', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('CSS-only charts');
  });

  it('recommends D3.js as CSP-safe option', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('D3.js');
    expect(UX_EXPERT_BASE_PROMPT).toContain('CSP-safe');
  });

  it('warns about unsafe-eval requirement for Chart.js', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('unsafe-eval');
  });

  it('forbids relaxing script-src CSP for library compatibility', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('never relax');
  });
});

// ============================================================================
// UX Expert Prompt — Typography & Fonts (Issue #1539)
// ============================================================================

describe('UX Expert Typography and Fonts', () => {
  it('includes typography section', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('## Typography & Fonts');
  });

  it('specifies clamp() for fluid sizing', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('clamp(');
  });

  it('requires self-hosting fonts via @font-face', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('@font-face');
    expect(UX_EXPERT_BASE_PROMPT).toContain('font-src');
  });

  it('requires font-display: swap', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('font-display: swap');
  });
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
