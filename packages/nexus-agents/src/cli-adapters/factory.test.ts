/**
 * Tests for CLI Adapter Factory
 *
 * Verifies factory functions create correct adapter types.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createCliAdapter, createAllAdapters } from './factory.js';
import { ClaudeCliAdapter } from './adapters/claude-adapter.js';
import { GeminiCliAdapter } from './adapters/gemini-adapter.js';
import { CodexCliAdapter } from './adapters/codex-adapter.js';
import { CodexMcpAdapter } from './adapters/codex-mcp-adapter.js';
import { getDefaultModelForCli, getCliModelName } from '../config/model-config-helpers.js';
import { DEFAULT_MODEL_CAPABILITIES } from '../config/in-tree-data.js';
import { CLI_NAMES } from '../config/model-capabilities-types.js';

/** Derive the expected default model ID for a CLI from the canonical registry. */
function expectedDefaultModelId(cli: 'claude' | 'gemini' | 'codex'): string {
  return getCliModelName(getDefaultModelForCli(cli));
}

/** Derive display name for a CLI model name by searching the registry. */
function expectedDisplayName(cliName: string, cliModelName: string): string {
  const model = DEFAULT_MODEL_CAPABILITIES.models.find(
    (m) => m.cliName === cliName && m.cliModelName === cliModelName
  );
  return model?.displayName ?? cliModelName;
}

describe('createCliAdapter', () => {
  it('should create ClaudeCliAdapter for claude', () => {
    const adapter = createCliAdapter({ cli: 'claude' });

    expect(adapter).toBeInstanceOf(ClaudeCliAdapter);
    expect(adapter.name).toBe('claude');
    expect(adapter.transport).toBe('subprocess');
  });

  it('should create GeminiCliAdapter for gemini', () => {
    const adapter = createCliAdapter({ cli: 'gemini' });

    expect(adapter).toBeInstanceOf(GeminiCliAdapter);
    expect(adapter.name).toBe('gemini');
    expect(adapter.transport).toBe('subprocess');
  });

  it('should create CodexMcpAdapter for codex by default', () => {
    const adapter = createCliAdapter({ cli: 'codex' });

    expect(adapter).toBeInstanceOf(CodexMcpAdapter);
    expect(adapter.name).toBe('codex');
    expect(adapter.transport).toBe('mcp');
  });

  it('should create CodexCliAdapter when subprocess transport specified', () => {
    const adapter = createCliAdapter({ cli: 'codex', transport: 'subprocess' });

    expect(adapter).toBeInstanceOf(CodexCliAdapter);
    expect(adapter.name).toBe('codex');
    expect(adapter.transport).toBe('subprocess');
  });

  it('should pass model option to Claude adapter', () => {
    // Legacy claude-opus-4 alias resolves to current Claude Opus via the
    // registry's aliases[] field (#2200 Child 1).
    const adapter = createCliAdapter({ cli: 'claude', model: 'claude-opus-4' });
    const info = adapter.getModelInfo();

    expect(info.id).toBe('claude-opus-4');
    expect(info.name).toBe('Claude Opus 4.6');
  });

  it('should pass model option to Gemini adapter', () => {
    const adapter = createCliAdapter({ cli: 'gemini', model: 'gemini-2.5-pro' });
    const info = adapter.getModelInfo();

    expect(info.id).toBe('gemini-2.5-pro');
    expect(info.name).toBe('Gemini 2.5 Pro');
  });

  it('should pass model option to Codex adapter', () => {
    const adapter = createCliAdapter({ cli: 'codex', model: 'gpt-5.6-terra' });
    const info = adapter.getModelInfo();

    expect(info.id).toBe('gpt-5.6-terra');
    expect(info.name).toBe(expectedDisplayName('codex', 'gpt-5.6-terra'));
  });

  it('should use default models when not specified', () => {
    const claude = createCliAdapter({ cli: 'claude' });
    const gemini = createCliAdapter({ cli: 'gemini' });
    const codex = createCliAdapter({ cli: 'codex' });

    // Derive expected model IDs from canonical registry (Issue #807, #882)
    expect(claude.getModelInfo().id).toBe(expectedDefaultModelId('claude'));
    expect(gemini.getModelInfo().id).toBe(expectedDefaultModelId('gemini'));
    expect(codex.getModelInfo().id).toBe(expectedDefaultModelId('codex'));
  });

  it('should throw for unsupported CLI', () => {
    // @ts-expect-error Testing invalid CLI name
    expect(() => createCliAdapter({ cli: 'unsupported' })).toThrow('Unsupported CLI');
  });
});

describe('createAllAdapters', () => {
  it('should create all adapters', () => {
    const adapters = createAllAdapters();

    expect(adapters.size).toBe(CLI_NAMES.length);
    for (const cli of CLI_NAMES) {
      expect(adapters.has(cli)).toBe(true);
    }
  });

  it('should create correct adapter types with MCP for codex by default', () => {
    const adapters = createAllAdapters();

    expect(adapters.get('claude')).toBeInstanceOf(ClaudeCliAdapter);
    expect(adapters.get('gemini')).toBeInstanceOf(GeminiCliAdapter);
    expect(adapters.get('codex')).toBeInstanceOf(CodexMcpAdapter);
  });

  it('should create CodexCliAdapter when subprocess transport specified', () => {
    const adapters = createAllAdapters(undefined, 'subprocess');

    expect(adapters.get('codex')).toBeInstanceOf(CodexCliAdapter);
  });

  it('should work with undefined logger', () => {
    const adapters = createAllAdapters(undefined);

    expect(adapters.size).toBe(CLI_NAMES.length);
  });

  // #3422: direct-API adapters become distinct routing arms only in api
  // billing mode with the vendor key present.
  describe('API routing arms (#3422)', () => {
    const prevBilling = process.env['NEXUS_BILLING_MODE'];
    const prevKey = process.env['ANTHROPIC_API_KEY'];

    afterEach(() => {
      if (prevBilling === undefined) delete process.env['NEXUS_BILLING_MODE'];
      else process.env['NEXUS_BILLING_MODE'] = prevBilling;
      if (prevKey === undefined) delete process.env['ANTHROPIC_API_KEY'];
      else process.env['ANTHROPIC_API_KEY'] = prevKey;
    });

    it('includes api:anthropic when NEXUS_BILLING_MODE=api and ANTHROPIC_API_KEY is set', () => {
      process.env['NEXUS_BILLING_MODE'] = 'api';
      process.env['ANTHROPIC_API_KEY'] = 'sk-test-key';

      const adapters = createAllAdapters();
      expect(adapters.has('api:anthropic')).toBe(true);
      // CLI slots still present alongside the API arm.
      for (const cli of CLI_NAMES) {
        expect(adapters.has(cli)).toBe(true);
      }
    });

    it('omits api:anthropic in default (plan) mode even with the key set', () => {
      delete process.env['NEXUS_BILLING_MODE'];
      process.env['ANTHROPIC_API_KEY'] = 'sk-test-key';

      const adapters = createAllAdapters();
      expect(adapters.has('api:anthropic')).toBe(false);
      expect(adapters.size).toBe(CLI_NAMES.length);
    });

    it('omits api:anthropic in api mode when the key is absent', () => {
      process.env['NEXUS_BILLING_MODE'] = 'api';
      delete process.env['ANTHROPIC_API_KEY'];

      const adapters = createAllAdapters();
      expect(adapters.has('api:anthropic')).toBe(false);
    });
  });
});

describe('adapter capabilities', () => {
  it('should have correct capabilities for Claude', () => {
    const adapter = createCliAdapter({ cli: 'claude' });
    const caps = adapter.capabilities;

    expect(caps.reasoning).toBe(10);
    expect(caps.contextWindow).toBe(1000000);
  });

  it('should have correct capabilities for Gemini', () => {
    const adapter = createCliAdapter({ cli: 'gemini' });
    const caps = adapter.capabilities;

    expect(caps.contextWindow).toBe(1_048_576);
  });

  it('should have correct capabilities for Codex', () => {
    const adapter = createCliAdapter({ cli: 'codex' });
    const caps = adapter.capabilities;

    expect(caps.contextWindow).toBe(1_050_000);
  });
});

describe('model info', () => {
  it('should return correct context window for Claude', () => {
    const adapter = createCliAdapter({ cli: 'claude' });
    const info = adapter.getModelInfo();

    expect(info.contextWindow).toBe(1000000);
    expect(info.maxOutput).toBe(128000);
  });

  it('should return correct context window for Gemini', () => {
    const adapter = createCliAdapter({ cli: 'gemini' });
    const info = adapter.getModelInfo();

    expect(info.contextWindow).toBe(1_048_576);
    expect(info.maxOutput).toBe(8192);
  });

  it('should return correct context window for Codex', () => {
    const adapter = createCliAdapter({ cli: 'codex' });
    const info = adapter.getModelInfo();

    expect(info.contextWindow).toBe(1_050_000);
    expect(info.maxOutput).toBe(128000);
  });

  it('should return cost info for all adapters', () => {
    const claude = createCliAdapter({ cli: 'claude' });
    const gemini = createCliAdapter({ cli: 'gemini' });
    const codex = createCliAdapter({ cli: 'codex' });

    expect(claude.getModelInfo().costPerMillionInput).toBeGreaterThan(0);
    expect(gemini.getModelInfo().costPerMillionInput).toBeGreaterThan(0);
    expect(codex.getModelInfo().costPerMillionInput).toBeGreaterThan(0);
  });
});
