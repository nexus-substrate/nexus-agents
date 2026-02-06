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
