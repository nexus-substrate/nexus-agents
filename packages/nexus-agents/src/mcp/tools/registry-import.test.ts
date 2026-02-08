/**
 * Tests for Registry Import
 * @module mcp/tools/registry-import.test
 */

import { describe, it, expect } from 'vitest';
import { generateRegistryEntry } from './registry-import.js';
import type { RegistryImportInput } from './registry-import-types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeInput(overrides: Partial<RegistryImportInput> = {}): RegistryImportInput {
  return {
    provider: 'anthropic',
    modelId: 'claude-4-opus-20260201',
    dryRun: true,
    ...overrides,
  };
}

// ============================================================================
// Draft entry generation
// ============================================================================

describe('generateRegistryEntry — draft generation', () => {
  it('returns a draft entry with conservative quality scores', () => {
    const result = generateRegistryEntry(makeInput());

    expect(result.dryRun).toBe(true);
    expect(result.persisted).toBe(false);
    expect(result.entry.qualityScores).toEqual({
      reasoning: 5,
      codeGeneration: 5,
      speed: 5,
      cost: 5,
    });
  });

  it('sets provider and cliName correctly for anthropic', () => {
    const result = generateRegistryEntry(makeInput({ provider: 'anthropic' }));

    expect(result.entry.provider).toBe('anthropic');
    expect(result.entry.cliName).toBe('claude');
  });

  it('sets provider and cliName correctly for google', () => {
    const result = generateRegistryEntry(
      makeInput({
        provider: 'google',
        modelId: 'gemini-3.5-pro',
      })
    );

    expect(result.entry.provider).toBe('google');
    expect(result.entry.cliName).toBe('gemini');
  });

  it('sets provider and cliName correctly for openai', () => {
    const result = generateRegistryEntry(
      makeInput({
        provider: 'openai',
        modelId: 'o4-mini',
      })
    );

    expect(result.entry.provider).toBe('openai');
    expect(result.entry.cliName).toBe('codex');
  });

  it('sets cliModelName to the raw modelId', () => {
    const result = generateRegistryEntry(makeInput({ modelId: 'my-new-model' }));

    expect(result.entry.cliModelName).toBe('my-new-model');
  });

  it('uses default context window for provider', () => {
    const anthropic = generateRegistryEntry(makeInput({ provider: 'anthropic' }));
    const google = generateRegistryEntry(
      makeInput({
        provider: 'google',
        modelId: 'test',
      })
    );
    const openai = generateRegistryEntry(
      makeInput({
        provider: 'openai',
        modelId: 'test',
      })
    );

    expect(anthropic.entry.contextWindow).toBe(200_000);
    expect(google.entry.contextWindow).toBe(1_000_000);
    expect(openai.entry.contextWindow).toBe(128_000);
  });

  it('sets pricing to zero as placeholder', () => {
    const result = generateRegistryEntry(makeInput());

    expect(result.entry.pricing).toEqual({ inputPer1M: 0, outputPer1M: 0 });
  });

  it('generates a display name from provider and modelId', () => {
    const result = generateRegistryEntry(
      makeInput({
        provider: 'anthropic',
        modelId: 'claude-4-opus-20260201',
      })
    );

    expect(result.entry.displayName).toContain('Claude');
  });
});

// ============================================================================
// Warnings
// ============================================================================

describe('generateRegistryEntry — warnings', () => {
  it('includes warnings about unvalidated scores', () => {
    const result = generateRegistryEntry(makeInput());

    expect(result.warnings.some((w) => w.includes('unvalidated'))).toBe(true);
  });

  it('includes warning about pricing', () => {
    const result = generateRegistryEntry(makeInput());

    expect(result.warnings.some((w) => w.includes('Pricing'))).toBe(true);
  });

  it('includes warning about context window', () => {
    const result = generateRegistryEntry(makeInput());

    expect(result.warnings.some((w) => w.includes('Context window'))).toBe(true);
  });

  it('includes warning about MODEL_IDS', () => {
    const result = generateRegistryEntry(makeInput());

    expect(result.warnings.some((w) => w.includes('MODEL_IDS'))).toBe(true);
  });
});

// ============================================================================
// Existing model detection
// ============================================================================

describe('generateRegistryEntry — existing model', () => {
  it('detects existing model by provider + cliModelName', () => {
    // 'gemini-2.5-pro' is the cliModelName for gemini-pro in the registry
    const result = generateRegistryEntry(
      makeInput({
        provider: 'google',
        modelId: 'gemini-2.5-pro',
      })
    );

    expect(result.warnings).toContain('Model already exists in registry — no changes made.');
    expect(result.persisted).toBe(false);
    expect(result.entry.id).toBe('gemini-pro');
  });
});

// ============================================================================
// dryRun flag
// ============================================================================

describe('generateRegistryEntry — dryRun', () => {
  it('passes through dryRun=true', () => {
    const result = generateRegistryEntry(makeInput({ dryRun: true }));

    expect(result.dryRun).toBe(true);
  });

  it('passes through dryRun=false', () => {
    const result = generateRegistryEntry(makeInput({ dryRun: false }));

    expect(result.dryRun).toBe(false);
    // Still not persisted (no runtime registry mutation)
    expect(result.persisted).toBe(false);
  });
});
