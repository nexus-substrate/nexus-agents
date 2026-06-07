/**
 * Tests for the unified ModelRegistry (#2540).
 */
import { describe, it, expect } from 'vitest';

import {
  ModelRegistry,
  deriveEntry,
  getDefaultRegistry,
  peekDefaultRegistry,
  reloadDefaultRegistry,
  setDefaultRegistry,
  type ModelEntry,
} from './model-registry.js';
import { resolveModelIdentitySync } from './model-identity.js';
import { getDefaultModelForCli, getInTreeCapabilitiesMatrix } from './model-config-helpers.js';

const sampleAuthoritative: ModelEntry = {
  id: 'claude-opus-4-1',
  aliases: ['anthropic/claude-opus-4-1', 'claude-opus-latest'],
  vendor: 'anthropic',
  family: 'claude-opus',
  version: '4-1',
  displayName: 'Claude Opus 4.1',
  contextWindow: 200_000,
  maxOutputTokens: 16_384,
  parallelToolCalls: true,
  promptCaching: 'ephemeral',
  toolDefinitionFormat: 'anthropic',
  maxRecommendedTurnBudget: 20,
  strictJson: true,
  quirks: [],
  profileId: 'claude-opus',
  source: 'in-tree',
};

describe('ModelRegistry — exact match', () => {
  it('returns authoritative entry for canonical id', () => {
    const reg = new ModelRegistry({ inTreeEntries: [sampleAuthoritative] });
    const entry = reg.getEntry('claude-opus-4-1');
    expect(entry.source).toBe('in-tree');
    expect(entry.contextWindow).toBe(200_000);
  });

  it('returns authoritative entry via alias', () => {
    const reg = new ModelRegistry({ inTreeEntries: [sampleAuthoritative] });
    const entry = reg.getEntry('anthropic/claude-opus-4-1');
    expect(entry.id).toBe('claude-opus-4-1');
    expect(entry.source).toBe('in-tree');
  });

  it('hasAuthoritative true for known id, false for unknown', () => {
    const reg = new ModelRegistry({ inTreeEntries: [sampleAuthoritative] });
    expect(reg.hasAuthoritative('claude-opus-4-1')).toBe(true);
    expect(reg.hasAuthoritative('mystery-model')).toBe(false);
  });
});

describe('ModelRegistry — derivation', () => {
  it('derives entry for unknown claude variant via vendor + family chain', () => {
    const reg = new ModelRegistry();
    const entry = reg.getEntry('claude-opus-5'); // not in registry
    expect(entry.source).toBe('derived');
    expect(entry.vendor).toBe('anthropic');
    expect(entry.family).toBe('claude-opus');
    // Family override: claude-opus has 20-turn budget
    expect(entry.maxRecommendedTurnBudget).toBe(20);
    expect(entry.profileId).toBe('claude-opus');
    expect(entry.parallelToolCalls).toBe(true); // anthropic default
    expect(entry.promptCaching).toBe('ephemeral');
  });

  it('derives entry for gateway-fronted model via vendor prefix', () => {
    const reg = new ModelRegistry();
    const entry = reg.getEntry('meta-llama/llama-3.3-70b-instruct');
    expect(entry.source).toBe('derived');
    expect(entry.vendor).toBe('meta');
    expect(entry.family).toBe('llama-3');
    // Meta default: sequential tools, 8-turn budget
    expect(entry.parallelToolCalls).toBe(false);
    expect(entry.maxRecommendedTurnBudget).toBe(8);
  });

  it('derives entry with thinking quirk bumping budget 1.5x', () => {
    const reg = new ModelRegistry();
    const entry = reg.getEntry('claude-opus-5-thinking');
    expect(entry.quirks).toContain('thinking');
    // Base claude-opus = 20 → ceil(20 * 1.5) = 30
    expect(entry.maxRecommendedTurnBudget).toBe(30);
  });

  it('derives universal default for fully opaque model', () => {
    const reg = new ModelRegistry();
    const entry = reg.getEntry('mystery-7b');
    expect(entry.source).toBe('derived');
    expect(entry.vendor).toBe('unknown');
    expect(entry.profileId).toBe('default');
    expect(entry.parallelToolCalls).toBe(false);
    expect(entry.maxRecommendedTurnBudget).toBe(10);
  });
});

describe('ModelRegistry — source priority', () => {
  it('manifest overrides in-tree', () => {
    const inTree: ModelEntry = { ...sampleAuthoritative, contextWindow: 100_000 };
    const manifest: ModelEntry = {
      ...sampleAuthoritative,
      contextWindow: 999_999,
      source: 'manifest',
    };
    const reg = new ModelRegistry({
      inTreeEntries: [inTree],
      manifestEntries: [manifest],
    });
    const entry = reg.getEntry('claude-opus-4-1');
    expect(entry.contextWindow).toBe(999_999);
    expect(entry.source).toBe('manifest');
  });

  it('in-tree overrides models.dev', () => {
    const dev: ModelEntry = {
      ...sampleAuthoritative,
      contextWindow: 50_000,
      source: 'models-dev',
    };
    const inTree: ModelEntry = { ...sampleAuthoritative, contextWindow: 200_000 };
    const reg = new ModelRegistry({
      modelsDevEntries: [dev],
      inTreeEntries: [inTree],
    });
    const entry = reg.getEntry('claude-opus-4-1');
    expect(entry.contextWindow).toBe(200_000);
    expect(entry.source).toBe('in-tree');
  });
});

describe('ModelRegistry — hints', () => {
  it('hints redirect derivation when modelId is opaque', () => {
    const reg = new ModelRegistry();
    const entry = reg.getEntry('workspace-prod-1', {
      vendor: 'anthropic',
      family: 'claude-opus',
    });
    expect(entry.vendor).toBe('anthropic');
    expect(entry.family).toBe('claude-opus');
    expect(entry.maxRecommendedTurnBudget).toBe(20);
  });
});

describe('deriveEntry helper', () => {
  it('preserves quirks from identity + vendor+family overrides', () => {
    const identity = resolveModelIdentitySync('gpt-4o-mini-2024-08');
    const entry = deriveEntry('gpt-4o-mini-2024-08', identity);
    expect(entry.vendor).toBe('openai');
    expect(entry.family).toBe('gpt-4o');
    expect(entry.quirks).toContain('small');
    expect(entry.quirks).toContain('dated');
    // openai default: parallel tools on
    expect(entry.parallelToolCalls).toBe(true);
  });

  it('embedding quirk propagates so AgenticAdapter can refuse', () => {
    const identity = resolveModelIdentitySync('text-embedding-3-large');
    const entry = deriveEntry('text-embedding-3-large', identity);
    expect(entry.quirks).toContain('embedding');
  });
});

describe('global registry helpers', () => {
  it('getDefaultRegistry returns the same instance across calls', () => {
    setDefaultRegistry(undefined); // reset
    const a = getDefaultRegistry();
    const b = getDefaultRegistry();
    expect(a).toBe(b);
  });

  it('setDefaultRegistry replaces the singleton', () => {
    const custom = new ModelRegistry({ inTreeEntries: [sampleAuthoritative] });
    setDefaultRegistry(custom);
    const fetched = getDefaultRegistry();
    expect(fetched).toBe(custom);
    expect(fetched.hasAuthoritative('claude-opus-4-1')).toBe(true);
    setDefaultRegistry(undefined);
  });

  it('getDefaultRegistry picks up the operator manifest overlay (#2547 4a)', async () => {
    // Write a temp manifest and point the env var at it. Reset the
    // singleton so the first lazy construction reads the overlay.
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    setDefaultRegistry(undefined);
    const dir = mkdtempSync(join(tmpdir(), 'manifest-overlay-rt-'));
    const path = join(dir, 'models-manifest.yaml');
    writeFileSync(
      path,
      `version: 1
models:
  - id: operator-only-model
    vendor: anthropic
    family: claude-opus
    contextWindow: 999999
`,
      'utf-8'
    );
    const previous = process.env['NEXUS_MODELS_OVERLAY_PATH'];
    process.env['NEXUS_MODELS_OVERLAY_PATH'] = path;
    try {
      const registry = getDefaultRegistry();
      const entry = registry.getEntry('operator-only-model');
      expect(entry.source).toBe('manifest');
      expect(entry.contextWindow).toBe(999999);
    } finally {
      if (previous === undefined) delete process.env['NEXUS_MODELS_OVERLAY_PATH'];
      else process.env['NEXUS_MODELS_OVERLAY_PATH'] = previous;
      setDefaultRegistry(undefined);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('user overlay overrides in-tree and operator manifest overrides user (#3351)', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    setDefaultRegistry(undefined);
    const dir = mkdtempSync(join(tmpdir(), 'overlay-precedence-rt-'));
    const userPath = join(dir, 'models.yaml');
    const operatorPath = join(dir, 'models-manifest.yaml');

    // User overlay: override an in-tree model + add a user-only model.
    writeFileSync(
      userPath,
      `version: 1
models:
  - id: claude-opus
    vendor: anthropic
    family: claude-opus
    contextWindow: 111111
  - id: user-shared
    vendor: anthropic
    family: claude-opus
    contextWindow: 222222
`,
      'utf-8'
    );
    // Operator manifest: override the same shared id (operator must win).
    writeFileSync(
      operatorPath,
      `version: 1
models:
  - id: user-shared
    vendor: anthropic
    family: claude-opus
    contextWindow: 333333
`,
      'utf-8'
    );

    const prevUser = process.env['NEXUS_MODEL_REGISTRY_OVERLAY'];
    const prevOp = process.env['NEXUS_MODELS_OVERLAY_PATH'];
    process.env['NEXUS_MODEL_REGISTRY_OVERLAY'] = userPath;
    process.env['NEXUS_MODELS_OVERLAY_PATH'] = operatorPath;
    try {
      const registry = getDefaultRegistry();
      // user overlay beats the in-tree claude-opus entry
      expect(registry.getEntry('claude-opus').contextWindow).toBe(111111);
      expect(registry.getEntry('claude-opus').source).toBe('manifest');
      // operator beats user on the shared id
      expect(registry.getEntry('user-shared').contextWindow).toBe(333333);
    } finally {
      if (prevUser === undefined) delete process.env['NEXUS_MODEL_REGISTRY_OVERLAY'];
      else process.env['NEXUS_MODEL_REGISTRY_OVERLAY'] = prevUser;
      if (prevOp === undefined) delete process.env['NEXUS_MODELS_OVERLAY_PATH'];
      else process.env['NEXUS_MODELS_OVERLAY_PATH'] = prevOp;
      setDefaultRegistry(undefined);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// #3185 — hot-reload of the model registry without a process restart.
// ============================================================================

describe('peekDefaultRegistry (#3185)', () => {
  it('returns undefined before construction and never constructs the singleton', () => {
    setDefaultRegistry(undefined);
    expect(peekDefaultRegistry()).toBeUndefined();
    // Still undefined — peek must NOT have triggered lazy construction.
    expect(peekDefaultRegistry()).toBeUndefined();
  });

  it('returns the live singleton once getDefaultRegistry has built it', () => {
    setDefaultRegistry(undefined);
    const built = getDefaultRegistry();
    expect(peekDefaultRegistry()).toBe(built);
    setDefaultRegistry(undefined);
  });
});

describe('getDefaultModelForCli — early-bootstrap fallback (#3185 condition 1)', () => {
  it('returns the static default id with NO registry constructed (no recursion)', () => {
    setDefaultRegistry(undefined);
    // peekDefaultRegistry() is undefined here, so the static fallback fires.
    expect(getDefaultModelForCli('claude')).toBe('claude-opus');
    // And it must NOT have constructed the registry as a side effect.
    expect(peekDefaultRegistry()).toBeUndefined();
  });
});

describe('reloadDefaultRegistry — overlay propagation without restart (#3185)', () => {
  it('propagates a post-startup overlay edit to getInTreeCapabilitiesMatrix + getDefaultModelForCli', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    setDefaultRegistry(undefined);
    // Build the registry with NO overlay first — baseline contextWindow.
    const baseline = getInTreeCapabilitiesMatrix().models.find((m) => m.id === 'claude-opus');
    expect(baseline).toBeDefined();
    expect(baseline?.contextWindow).not.toBe(123456);

    const dir = mkdtempSync(join(tmpdir(), 'reload-overlay-'));
    const path = join(dir, 'models-manifest.yaml');
    writeFileSync(
      path,
      `version: 1
models:
  - id: claude-opus
    vendor: anthropic
    family: claude-opus
    cliName: claude
    contextWindow: 123456
`,
      'utf-8'
    );
    const previous = process.env['NEXUS_MODELS_OVERLAY_PATH'];
    process.env['NEXUS_MODELS_OVERLAY_PATH'] = path;
    try {
      // Reload WITHOUT a process restart — overlay must now win.
      await reloadDefaultRegistry();
      const after = getInTreeCapabilitiesMatrix().models.find((m) => m.id === 'claude-opus');
      expect(after?.contextWindow).toBe(123456);
      // getDefaultModelForCli still resolves to the canonical id, now via the
      // overlay-bearing registry (it exists post-reload).
      expect(getDefaultModelForCli('claude')).toBe('claude-opus');
      expect(peekDefaultRegistry()).toBeDefined();
    } finally {
      if (previous === undefined) delete process.env['NEXUS_MODELS_OVERLAY_PATH'];
      else process.env['NEXUS_MODELS_OVERLAY_PATH'] = previous;
      setDefaultRegistry(undefined);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never throws on a malformed overlay during re-read (condition 3)', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    setDefaultRegistry(undefined);
    const dir = mkdtempSync(join(tmpdir(), 'reload-malformed-'));
    const path = join(dir, 'models-manifest.yaml');
    writeFileSync(path, ':\n  - not: [valid: yaml: at all', 'utf-8');
    const previous = process.env['NEXUS_MODELS_OVERLAY_PATH'];
    process.env['NEXUS_MODELS_OVERLAY_PATH'] = path;
    try {
      // Must degrade to the in-tree floor, not throw.
      await expect(reloadDefaultRegistry()).resolves.toBeDefined();
      // In-tree entries still resolve.
      expect(getDefaultModelForCli('claude')).toBe('claude-opus');
    } finally {
      if (previous === undefined) delete process.env['NEXUS_MODELS_OVERLAY_PATH'];
      else process.env['NEXUS_MODELS_OVERLAY_PATH'] = previous;
      setDefaultRegistry(undefined);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('reloadDefaultRegistry — atomic dual-singleton reset (#3185 condition 2)', () => {
  it('resets BOTH the model registry and the UnifiedAdapterRegistry together', async () => {
    const { getGlobalRegistry } = await import('../adapters/unified-registry.js');

    setDefaultRegistry(undefined);
    // Construct both singletons.
    const modelBefore = getDefaultRegistry();
    const adapterBefore = getGlobalRegistry();

    await reloadDefaultRegistry();

    const modelAfter = getDefaultRegistry();
    const adapterAfter = getGlobalRegistry();

    // Both must be fresh instances — no state where one is stale + one fresh.
    expect(modelAfter).not.toBe(modelBefore);
    expect(adapterAfter).not.toBe(adapterBefore);

    adapterAfter.dispose();
    setDefaultRegistry(undefined);
  });
});
