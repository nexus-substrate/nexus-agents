/**
 * Tests for Code + Architecture Expert dual-mode prompts (Issue #1861).
 *
 * Validates the split between review/audit (default, gated) and
 * generate/design (flexible) modes, the mode-selection helpers, and
 * the content invariants for each mode.
 */

import { describe, it, expect } from 'vitest';
import {
  CODE_EXPERT_BASE_PROMPT,
  CODE_EXPERT_GENERATE_PROMPT,
  getCodeExpertPrompt,
} from './expert-prompts/code-expert.js';
import {
  ARCHITECTURE_EXPERT_BASE_PROMPT,
  ARCHITECTURE_EXPERT_DESIGN_PROMPT,
  getArchitectureExpertPrompt,
} from './expert-prompts/architecture-expert.js';

// ---------------------------------------------------------------------------
// Code expert — shared invariants across both modes
// ---------------------------------------------------------------------------

describe.each([
  ['review', CODE_EXPERT_BASE_PROMPT],
  ['generate', CODE_EXPERT_GENERATE_PROMPT],
])('Code expert shared invariants — %s mode', (_mode, prompt) => {
  it('preserves canonical-path rule', () => {
    expect(prompt).toContain('canonical paths');
  });

  it('enforces anti-sprawl', () => {
    expect(prompt).toContain('Anti-sprawl');
    expect(prompt).toContain('enhanced_');
  });

  it('states the priority order', () => {
    expect(prompt).toContain('correctness > simplicity > performance > cleverness');
  });

  it('states YAGNI', () => {
    expect(prompt).toContain('YAGNI');
  });

  it('bans any type', () => {
    expect(prompt).toContain('no-explicit-any');
  });

  it('mandates Result<T, E> over thrown exceptions', () => {
    expect(prompt).toContain('Result<T, E>');
  });

  it('includes anti-pattern prohibitions section', () => {
    expect(prompt).toContain('Anti-Pattern Prohibitions');
  });

  it('includes reference implementation cite', () => {
    expect(prompt).toContain('Reference Implementation');
    expect(prompt).toContain('src/adapters/unified-registry.ts');
  });

  it('includes push-back cues', () => {
    expect(prompt).toContain('Push-Back Cues');
  });
});

describe('Code expert review mode specifics', () => {
  it('announces itself as review mode', () => {
    expect(CODE_EXPERT_BASE_PROMPT).toContain('review mode');
  });

  it('includes the structured JSON findings schema', () => {
    expect(CODE_EXPERT_BASE_PROMPT).toContain('"issues"');
    expect(CODE_EXPERT_BASE_PROMPT).toContain('"suggestions"');
    expect(CODE_EXPERT_BASE_PROMPT).toContain('"confidence"');
  });
});

describe('Code expert generate mode specifics', () => {
  it('announces itself as generate mode', () => {
    expect(CODE_EXPERT_GENERATE_PROMPT).toContain('generate mode');
  });

  it('allows flexible output with running code + inline rationale', () => {
    expect(CODE_EXPERT_GENERATE_PROMPT).toContain('Running code');
    expect(CODE_EXPERT_GENERATE_PROMPT).toContain('Inline rationale');
  });

  it('marks JSON as optional for programmatic consumers only', () => {
    expect(CODE_EXPERT_GENERATE_PROMPT).toContain(
      'Only use JSON output if the caller is a programmatic consumer'
    );
  });
});

describe('getCodeExpertPrompt mode selector', () => {
  it('defaults to review mode', () => {
    expect(getCodeExpertPrompt()).toBe(CODE_EXPERT_BASE_PROMPT);
  });

  it('returns generate prompt when requested', () => {
    expect(getCodeExpertPrompt('generate')).toBe(CODE_EXPERT_GENERATE_PROMPT);
  });

  it('review and generate prompts are distinct', () => {
    expect(CODE_EXPERT_BASE_PROMPT).not.toBe(CODE_EXPERT_GENERATE_PROMPT);
  });
});

// ---------------------------------------------------------------------------
// Architecture expert — shared invariants across both modes
// ---------------------------------------------------------------------------

describe.each([
  ['audit', ARCHITECTURE_EXPERT_BASE_PROMPT],
  ['design', ARCHITECTURE_EXPERT_DESIGN_PROMPT],
])('Architecture expert shared invariants — %s mode', (_mode, prompt) => {
  it('preserves canonical-path rule', () => {
    expect(prompt).toContain('canonical paths');
  });

  it('favours composition over inheritance', () => {
    expect(prompt).toContain('composition over inheritance');
  });

  it('includes anti-pattern prohibitions section', () => {
    expect(prompt).toContain('Anti-Pattern Prohibitions');
  });

  it('forbids factory-for-one', () => {
    expect(prompt).toContain('factory pattern for single-use objects');
  });

  it('forbids speculative adapter layers', () => {
    expect(prompt).toContain('No adapter layer unless');
  });

  it('includes reference implementation cite', () => {
    expect(prompt).toContain('Reference Implementation');
    expect(prompt).toContain('unified-registry.ts');
  });

  it('includes push-back cues', () => {
    expect(prompt).toContain('Push-Back Cues');
  });
});

describe('Architecture expert audit mode specifics', () => {
  it('announces itself as audit mode', () => {
    expect(ARCHITECTURE_EXPERT_BASE_PROMPT).toContain('audit mode');
  });

  it('includes the structured JSON patterns/components schema', () => {
    expect(ARCHITECTURE_EXPERT_BASE_PROMPT).toContain('"patterns"');
    expect(ARCHITECTURE_EXPERT_BASE_PROMPT).toContain('"components"');
    expect(ARCHITECTURE_EXPERT_BASE_PROMPT).toContain('"confidence"');
  });

  it('forbids greenfield design in audit mode', () => {
    expect(ARCHITECTURE_EXPERT_BASE_PROMPT).toContain("that's design-mode work");
  });
});

describe('Architecture expert design mode specifics', () => {
  it('announces itself as design mode', () => {
    expect(ARCHITECTURE_EXPERT_DESIGN_PROMPT).toContain('design mode');
  });

  it('requires committing to one design', () => {
    expect(ARCHITECTURE_EXPERT_DESIGN_PROMPT).toContain('Commit to one design');
  });

  it('requires naming rejected alternatives', () => {
    expect(ARCHITECTURE_EXPERT_DESIGN_PROMPT).toContain('naming the alternative you rejected');
  });

  it('forbids knee-jerk CQRS/microservices', () => {
    expect(ARCHITECTURE_EXPERT_DESIGN_PROMPT).toContain(
      'Do not propose CQRS/microservices/event-sourcing'
    );
  });
});

describe('getArchitectureExpertPrompt mode selector', () => {
  it('defaults to audit mode', () => {
    expect(getArchitectureExpertPrompt()).toBe(ARCHITECTURE_EXPERT_BASE_PROMPT);
  });

  it('returns design prompt when requested', () => {
    expect(getArchitectureExpertPrompt('design')).toBe(ARCHITECTURE_EXPERT_DESIGN_PROMPT);
  });

  it('audit and design prompts are distinct', () => {
    expect(ARCHITECTURE_EXPERT_BASE_PROMPT).not.toBe(ARCHITECTURE_EXPERT_DESIGN_PROMPT);
  });
});
