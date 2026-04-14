/**
 * Tests for UX Expert Dual-Mode Prompts (Issue #1853)
 *
 * Validates the split between enforcement and creative modes, the
 * mode-selection helper, and the content invariants for each mode.
 *
 * @module agents/experts/ux-expert-design.test
 */

import { describe, it, expect } from 'vitest';
import {
  UX_EXPERT_BASE_PROMPT,
  UX_EXPERT_CREATIVE_PROMPT,
  getUxExpertPrompt,
} from './expert-prompts/ux-expert.js';

// ============================================================================
// Shared invariants — must hold in BOTH modes
// ============================================================================

describe.each([
  ['enforcement', UX_EXPERT_BASE_PROMPT],
  ['creative', UX_EXPERT_CREATIVE_PROMPT],
])('UX Expert shared invariants — %s mode', (_mode, prompt) => {
  it('mandates OKLCH (no hex/rgb/hsl)', () => {
    expect(prompt).toContain('OKLCH');
    expect(prompt).toContain('oklch()');
  });

  it('mandates WCAG 2.1 AA floors', () => {
    expect(prompt).toContain('4.5:1');
    expect(prompt).toContain('3:1');
  });

  it('mentions APCA advisory (WCAG 3 draft)', () => {
    expect(prompt).toContain('APCA');
  });

  it('requires prefers-reduced-motion respect', () => {
    expect(prompt).toContain('prefers-reduced-motion');
  });

  it('mandates 44x44 touch target floor', () => {
    expect(prompt).toContain('44');
  });

  it('mandates zero-JS default (Astro + Svelte islands)', () => {
    expect(prompt).toContain('Astro');
    expect(prompt).toContain('Svelte');
  });

  it('mandates page-has-h1 (sr-only acceptable)', () => {
    expect(prompt).toContain('level-one heading');
  });

  it('advocates for the user', () => {
    expect(prompt).toContain('Advocate for the user');
  });
});

// ============================================================================
// Enforcement-mode specifics
// ============================================================================

describe('UX Expert enforcement mode', () => {
  it('includes structured JSON output schema', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('"findings"');
    expect(UX_EXPERT_BASE_PROMPT).toContain('"designSystem"');
    expect(UX_EXPERT_BASE_PROMPT).toContain('"userJourney"');
    expect(UX_EXPERT_BASE_PROMPT).toContain('"recommendations"');
    expect(UX_EXPERT_BASE_PROMPT).toContain('"confidence"');
  });

  it('includes pre-delivery checklist', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('Pre-Delivery Checklist');
    expect(UX_EXPERT_BASE_PROMPT).toContain('No emoji icons');
    expect(UX_EXPERT_BASE_PROMPT).toContain('150–300ms');
    expect(UX_EXPERT_BASE_PROMPT).toContain('375px');
    expect(UX_EXPERT_BASE_PROMPT).toContain('768px');
    expect(UX_EXPERT_BASE_PROMPT).toContain('1024px');
    expect(UX_EXPERT_BASE_PROMPT).toContain('1440px');
  });

  it('includes XSS prevention (innerHTML + user input)', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('innerHTML');
    expect(UX_EXPERT_BASE_PROMPT).toContain('XSS');
  });

  it('includes UX Analysis Framework', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('UX Analysis Framework');
    expect(UX_EXPERT_BASE_PROMPT).toContain('Usability');
    expect(UX_EXPERT_BASE_PROMPT).toContain('Learnability');
  });

  it('does NOT mandate Material Design 3', () => {
    expect(UX_EXPERT_BASE_PROMPT).not.toContain('Material Design 3 (M3) Implementation');
  });

  it('announces itself as enforcement mode', () => {
    expect(UX_EXPERT_BASE_PROMPT).toContain('enforcement mode');
  });
});

// ============================================================================
// Creative-mode specifics
// ============================================================================

describe('UX Expert creative mode', () => {
  it('announces itself as creative mode', () => {
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('creative mode');
  });

  it('requires commitment to an aesthetic direction', () => {
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('Commit to an Aesthetic Direction');
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('tone catalog');
  });

  it('lists the full tone catalog', () => {
    const tones = [
      'editorial/magazine',
      'brutalist/raw',
      'retro-futuristic',
      'art-deco/geometric',
      'soft/pastel',
      'industrial/utilitarian',
      'luxury/refined',
      'playful/toy-like',
      'organic/natural',
      'maximalist-chaos',
      'brutally-minimal',
      'typewriter/archive',
    ];
    for (const tone of tones) {
      expect(UX_EXPERT_CREATIVE_PROMPT).toContain(tone);
    }
  });

  it('prohibits generic display typefaces', () => {
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('Anti-AI-Slop Prohibitions');
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('Inter');
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('Roboto');
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('Space Grotesk');
  });

  it('prohibits purple-on-white and card-grid defaults', () => {
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('purple gradients');
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('card grid');
  });

  it('does NOT apply M3 by default', () => {
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain(
      'Do NOT apply Material Design 3 unless the caller explicitly requests it'
    );
  });

  it('lists preferred distinctive display faces', () => {
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('Fraunces');
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('Newsreader');
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('IBM Plex Mono');
  });

  it('cites the williamzujkowski.github.io reference implementation', () => {
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('Remarque');
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('Broadsheet');
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('Departure');
  });

  it('requires atmosphere and composition moves', () => {
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('Atmosphere');
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('Composition Moves');
  });

  it('requires matching implementation complexity to tone', () => {
    expect(UX_EXPERT_CREATIVE_PROMPT).toContain('Match Complexity to Tone');
  });
});

// ============================================================================
// Mode selector
// ============================================================================

describe('getUxExpertPrompt mode selector', () => {
  it('defaults to enforcement mode', () => {
    expect(getUxExpertPrompt()).toBe(UX_EXPERT_BASE_PROMPT);
  });

  it('returns enforcement prompt when enforcement is requested', () => {
    expect(getUxExpertPrompt('enforcement')).toBe(UX_EXPERT_BASE_PROMPT);
  });

  it('returns creative prompt when creative is requested', () => {
    expect(getUxExpertPrompt('creative')).toBe(UX_EXPERT_CREATIVE_PROMPT);
  });

  it('enforcement and creative prompts are distinct', () => {
    expect(UX_EXPERT_BASE_PROMPT).not.toBe(UX_EXPERT_CREATIVE_PROMPT);
  });
});
