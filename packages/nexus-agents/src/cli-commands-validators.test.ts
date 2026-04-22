/**
 * Tests for CLI Commands Validators
 *
 * @module cli-commands-validators.test
 */

import { describe, it, expect } from 'vitest';
import {
  isValidExpertListFormat,
  isValidOrchestrateModel,
  isValidThreshold,
  isValidIndexSubcommand,
  isValidIndexFormat,
  isValidResearchFormat,
  parsePositiveInt,
} from './cli-commands-validators.js';

// ============================================================================
// isValidExpertListFormat
// ============================================================================

describe('isValidExpertListFormat', () => {
  it('accepts table', () => {
    expect(isValidExpertListFormat('table')).toBe(true);
  });

  it('accepts json', () => {
    expect(isValidExpertListFormat('json')).toBe(true);
  });

  it('accepts yaml', () => {
    expect(isValidExpertListFormat('yaml')).toBe(true);
  });

  it('rejects unknown format', () => {
    expect(isValidExpertListFormat('csv')).toBe(false);
    expect(isValidExpertListFormat('')).toBe(false);
  });
});

// ============================================================================
// isValidOrchestrateModel
// ============================================================================

describe('isValidOrchestrateModel', () => {
  it('accepts claude', () => {
    expect(isValidOrchestrateModel('claude')).toBe(true);
  });

  it('accepts gemini', () => {
    expect(isValidOrchestrateModel('gemini')).toBe(true);
  });

  it('accepts codex', () => {
    expect(isValidOrchestrateModel('codex')).toBe(true);
  });

  it('rejects unknown model', () => {
    expect(isValidOrchestrateModel('gpt4')).toBe(false);
    expect(isValidOrchestrateModel('')).toBe(false);
  });
});

// ============================================================================
// isValidThreshold
// ============================================================================

describe('isValidThreshold', () => {
  it('accepts majority', () => {
    expect(isValidThreshold('majority')).toBe(true);
  });

  it('accepts supermajority', () => {
    expect(isValidThreshold('supermajority')).toBe(true);
  });

  it('accepts unanimous', () => {
    expect(isValidThreshold('unanimous')).toBe(true);
  });

  it('rejects unknown threshold', () => {
    expect(isValidThreshold('simple')).toBe(false);
    expect(isValidThreshold('')).toBe(false);
  });
});

// ============================================================================
// isValidIndexSubcommand
// ============================================================================

describe('isValidIndexSubcommand', () => {
  it('accepts generate', () => {
    expect(isValidIndexSubcommand('generate')).toBe(true);
  });

  it('accepts check', () => {
    expect(isValidIndexSubcommand('check')).toBe(true);
  });

  it('accepts diagram', () => {
    expect(isValidIndexSubcommand('diagram')).toBe(true);
  });

  it('accepts validate', () => {
    expect(isValidIndexSubcommand('validate')).toBe(true);
  });

  it('accepts entrypoints', () => {
    expect(isValidIndexSubcommand('entrypoints')).toBe(true);
  });

  it('accepts freshness', () => {
    expect(isValidIndexSubcommand('freshness')).toBe(true);
  });

  it('accepts links', () => {
    expect(isValidIndexSubcommand('links')).toBe(true);
  });

  it('rejects unknown subcommand', () => {
    expect(isValidIndexSubcommand('unknown')).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidIndexSubcommand(undefined)).toBe(false);
  });
});

// ============================================================================
// isValidIndexFormat
// ============================================================================

describe('isValidIndexFormat', () => {
  it('accepts yaml', () => {
    expect(isValidIndexFormat('yaml')).toBe(true);
  });

  it('accepts json', () => {
    expect(isValidIndexFormat('json')).toBe(true);
  });

  it('rejects table', () => {
    expect(isValidIndexFormat('table')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidIndexFormat('')).toBe(false);
  });
});

// ============================================================================
// isValidResearchFormat
// ============================================================================

describe('isValidResearchFormat', () => {
  it('accepts table', () => {
    expect(isValidResearchFormat('table')).toBe(true);
  });

  it('accepts json', () => {
    expect(isValidResearchFormat('json')).toBe(true);
  });

  it('rejects yaml', () => {
    expect(isValidResearchFormat('yaml')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidResearchFormat('')).toBe(false);
  });
});

// ============================================================================
// parsePositiveInt (#2161)
// ============================================================================

describe('parsePositiveInt', () => {
  it('returns the parsed integer when input is a positive numeric string', () => {
    expect(parsePositiveInt('7', 10)).toBe(7);
    expect(parsePositiveInt('100', 50)).toBe(100);
  });

  it('returns defaultVal when arg is undefined', () => {
    expect(parsePositiveInt(undefined, 50)).toBe(50);
  });

  it('returns defaultVal when input is not numeric', () => {
    expect(parsePositiveInt('abc', 50)).toBe(50);
    expect(parsePositiveInt('', 50)).toBe(50);
  });

  it('returns defaultVal for zero (boundary: <=0 is rejected)', () => {
    expect(parsePositiveInt('0', 30)).toBe(30);
  });

  it('returns defaultVal for negative numbers', () => {
    expect(parsePositiveInt('-5', 30)).toBe(30);
  });

  it('truncates floating-point-looking input (parseInt behavior)', () => {
    // Documents the parseInt(arg, 10) truncation for future readers.
    expect(parsePositiveInt('12.9', 0)).toBe(12);
  });

  it('parses leading numeric prefix (parseInt behavior)', () => {
    // parseInt stops at the first non-numeric character. This is the same
    // behavior the three original call sites had.
    expect(parsePositiveInt('42abc', 0)).toBe(42);
  });

  it('respects radix 10 for inputs like "08" (not octal)', () => {
    expect(parsePositiveInt('08', 0)).toBe(8);
  });
});
