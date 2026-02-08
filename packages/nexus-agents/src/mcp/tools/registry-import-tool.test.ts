/**
 * Tests for registry_import MCP tool handler.
 *
 * @module mcp/tools/registry-import-tool.test
 * (Source: Issue #889, Epic #888)
 */

import { describe, it, expect, vi } from 'vitest';
import { RegistryImportInputSchema } from './registry-import-types.js';

// ============================================================================
// Schema Validation
// ============================================================================

describe('RegistryImportInputSchema', () => {
  it('accepts valid anthropic provider input', () => {
    const result = RegistryImportInputSchema.safeParse({
      provider: 'anthropic',
      modelId: 'claude-4-opus-20260201',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid google provider input', () => {
    const result = RegistryImportInputSchema.safeParse({
      provider: 'google',
      modelId: 'gemini-2.5-pro',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid openai provider input', () => {
    const result = RegistryImportInputSchema.safeParse({
      provider: 'openai',
      modelId: 'o4-mini',
    });
    expect(result.success).toBe(true);
  });

  it('defaults dryRun to true', () => {
    const result = RegistryImportInputSchema.safeParse({
      provider: 'anthropic',
      modelId: 'test-model',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.dryRun).toBe(true);
  });

  it('accepts explicit dryRun false', () => {
    const result = RegistryImportInputSchema.safeParse({
      provider: 'anthropic',
      modelId: 'test-model',
      dryRun: false,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.dryRun).toBe(false);
  });

  it('rejects invalid provider', () => {
    const result = RegistryImportInputSchema.safeParse({
      provider: 'mistral',
      modelId: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty modelId', () => {
    const result = RegistryImportInputSchema.safeParse({
      provider: 'anthropic',
      modelId: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing provider', () => {
    const result = RegistryImportInputSchema.safeParse({
      modelId: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing modelId', () => {
    const result = RegistryImportInputSchema.safeParse({
      provider: 'anthropic',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Handler integration (via generateRegistryEntry)
// ============================================================================

describe('generateRegistryEntry integration', () => {
  it('generates entry for anthropic model', async () => {
    const { generateRegistryEntry } = await import('./registry-import.js');
    const result = generateRegistryEntry({
      provider: 'anthropic',
      modelId: 'claude-test-model',
      dryRun: true,
    });
    expect(result.dryRun).toBe(true);
    expect(result.persisted).toBe(false);
    expect(result.entry.provider).toBe('anthropic');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('generates entry for google model', async () => {
    const { generateRegistryEntry } = await import('./registry-import.js');
    const result = generateRegistryEntry({
      provider: 'google',
      modelId: 'gemini-test',
      dryRun: true,
    });
    expect(result.entry.provider).toBe('google');
  });

  it('generates entry for openai model', async () => {
    const { generateRegistryEntry } = await import('./registry-import.js');
    const result = generateRegistryEntry({
      provider: 'openai',
      modelId: 'gpt-test',
      dryRun: true,
    });
    expect(result.entry.provider).toBe('openai');
  });
});

// ============================================================================
// Registration contract
// ============================================================================

describe('registerRegistryImportTool', () => {
  it('registers tool with correct name', async () => {
    const { registerRegistryImportTool } = await import('./registry-import-tool.js');
    const registerTool = vi.fn();
    const mockServer = { registerTool } as unknown as Parameters<
      typeof registerRegistryImportTool
    >[0];
    const mockRateLimiter = {
      tryAcquire: vi.fn().mockReturnValue(true),
    } as unknown as Parameters<typeof registerRegistryImportTool>[1]['rateLimiter'];

    registerRegistryImportTool(mockServer, { rateLimiter: mockRateLimiter });

    expect(registerTool).toHaveBeenCalledOnce();
    const callArgs = registerTool.mock.calls[0] as unknown[];
    expect(callArgs[0]).toBe('registry_import');
  });
});
