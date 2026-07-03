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
import {
  getDefaultModelForCli,
  getInTreeCapabilitiesMatrix,
  lookupInTreeCapability,
} from './model-config-helpers.js';

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

// ============================================================================
// #4164 — normalized/identity resolution tier for decorated gateway model ids.
// OpenAI-compatible gateways expose vendor models under decorated names
// (`Claude_Opus_4.8_hardened`, `2025-claude-opus-4_0_high`); on exact miss the
// registry retries with the normalized id, then identity-matches
// {vendor, family, version} against loaded entries. Matches grant
// PRICING/METADATA ONLY — behaviour fields still come from derivation.
// ============================================================================

/**
 * Canonical entry with deliberately UNUSUAL behaviour values so tests can
 * prove the fuzzy tier does NOT inherit them (derived values must win).
 */
const opus48Canonical: ModelEntry = {
  id: 'claude-opus-4-8',
  aliases: ['claude-opus-48-latest'],
  vendor: 'anthropic',
  family: 'claude-opus',
  version: '4-8',
  displayName: 'Claude Opus 4.8',
  contextWindow: 1_000_000,
  maxOutputTokens: 128_000,
  pricing: { inputPer1M: 5, outputPer1M: 25 },
  parallelToolCalls: false, // derived for anthropic: true
  promptCaching: 'none', // derived for anthropic: 'ephemeral'
  toolDefinitionFormat: 'openai', // derived for anthropic: 'anthropic'
  maxRecommendedTurnBudget: 99, // derived for claude-opus: 20
  strictJson: false, // derived: true
  quirks: ['matched-entry-quirk'],
  profileId: 'matched-entry-profile', // derived: 'claude-opus'
  cliName: 'claude',
  cliAlias: 'opus-48',
  cliModelName: 'claude-opus-4-8',
  unsupportedParameters: ['temperature'],
  maxTokensParam: 'max_completion_tokens',
  source: 'in-tree',
  verifiedAt: '2026-01-01',
};

const opus40Snapshot: ModelEntry = {
  id: 'claude-opus-4-0',
  vendor: 'anthropic',
  family: 'claude-opus',
  version: '4-0',
  displayName: 'Claude Opus 4 (latest)',
  contextWindow: 200_000,
  maxOutputTokens: 32_000,
  pricing: { inputPer1M: 15, outputPer1M: 75 },
  parallelToolCalls: false,
  promptCaching: 'none',
  toolDefinitionFormat: 'openai',
  maxRecommendedTurnBudget: 10,
  strictJson: true,
  quirks: [],
  profileId: 'models-dev-anthropic',
  source: 'models-dev',
};

const haikuVersionless: ModelEntry = {
  id: 'claude-haiku',
  vendor: 'anthropic',
  family: 'claude-haiku',
  pricing: { inputPer1M: 1, outputPer1M: 5 },
  parallelToolCalls: true,
  promptCaching: 'ephemeral',
  toolDefinitionFormat: 'anthropic',
  maxRecommendedTurnBudget: 8,
  strictJson: true,
  quirks: [],
  profileId: 'claude-haiku',
  source: 'in-tree',
};

function generatedOpus48(
  id: string,
  pricing: { inputPer1M: number; outputPer1M: number }
): ModelEntry {
  return {
    id,
    vendor: 'anthropic',
    family: 'claude-opus',
    version: '4-8',
    pricing,
    contextWindow: 500_000,
    parallelToolCalls: false,
    promptCaching: 'none',
    toolDefinitionFormat: 'openai',
    maxRecommendedTurnBudget: 10,
    strictJson: true,
    quirks: [],
    profileId: 'litellm-derived',
    source: 'generated',
  };
}

describe('ModelRegistry — normalized resolution tier (#4164)', () => {
  it('resolves a case/underscore-decorated exact id via the normalized id', () => {
    const reg = new ModelRegistry({ inTreeEntries: [opus48Canonical] });
    const entry = reg.getEntry('Claude_Opus_4-8');
    expect(entry.id).toBe('Claude_Opus_4-8'); // caller's id preserved
    expect(entry.matchedVia).toBe('normalized');
    expect(entry.resolvedFrom).toBe('claude-opus-4-8');
    expect(entry.pricing).toEqual({ inputPer1M: 5, outputPer1M: 25 });
    expect(entry.contextWindow).toBe(1_000_000);
    expect(entry.source).toBe('derived');
  });

  it('resolves a decorated ALIAS via the normalized id (alias + alias-shadow keep working)', () => {
    const reg = new ModelRegistry({ inTreeEntries: [opus48Canonical] });
    const entry = reg.getEntry('Claude_Opus_48-Latest');
    expect(entry.matchedVia).toBe('normalized');
    expect(entry.resolvedFrom).toBe('claude-opus-4-8');
    expect(entry.pricing).toEqual({ inputPer1M: 5, outputPer1M: 25 });
  });
});

describe('ModelRegistry — identity resolution tier (#4164)', () => {
  it.each(['Claude_Opus_4.8_hardened', 'claude-opus-4.8-hardened'])(
    'resolves decorated id %s to the canonical entry pricing/metadata',
    (decorated) => {
      const reg = new ModelRegistry({ inTreeEntries: [opus48Canonical] });
      const entry = reg.getEntry(decorated);
      expect(entry.id).toBe(decorated); // caller's id preserved
      expect(entry.matchedVia).toBe('identity');
      expect(entry.resolvedFrom).toBe('claude-opus-4-8');
      expect(entry.pricing).toEqual({ inputPer1M: 5, outputPer1M: 25 });
      expect(entry.contextWindow).toBe(1_000_000);
      expect(entry.maxOutputTokens).toBe(128_000);
      expect(entry.displayName).toBe('Claude Opus 4.8');
      expect(entry.source).toBe('derived');
    }
  );

  it('resolves 2025-claude-opus-4_0_high against a breadth-tier entry (merged, never raw)', () => {
    const reg = new ModelRegistry({ modelsDevEntries: [opus40Snapshot] });
    const entry = reg.getEntry('2025-claude-opus-4_0_high');
    expect(entry.id).toBe('2025-claude-opus-4_0_high');
    expect(entry.matchedVia).toBe('identity');
    expect(entry.resolvedFrom).toBe('claude-opus-4-0');
    expect(entry.pricing).toEqual({ inputPer1M: 15, outputPer1M: 75 });
    // #3293 semantics: breadth-tier data merges with derivation — behaviour
    // fields must be the derived anthropic/claude-opus values, not the
    // snapshot's, and the source is non-authoritative.
    expect(entry.source).toBe('derived');
    expect(entry.toolDefinitionFormat).toBe('anthropic');
    expect(entry.profileId).toBe('claude-opus');
    expect(entry.quirks).toContain('high-variant');
  });

  it('grants pricing/metadata ONLY — behaviour fields come from derivation for the original id', () => {
    const reg = new ModelRegistry({ inTreeEntries: [opus48Canonical] });
    const entry = reg.getEntry('Claude_Opus_4.8_hardened');
    // Derived anthropic/claude-opus behaviour wins over the matched entry's
    // unusual values.
    expect(entry.parallelToolCalls).toBe(true);
    expect(entry.promptCaching).toBe('ephemeral');
    expect(entry.toolDefinitionFormat).toBe('anthropic');
    expect(entry.maxRecommendedTurnBudget).toBe(20);
    expect(entry.strictJson).toBe(true);
    expect(entry.profileId).toBe('claude-opus');
    expect(entry.quirks).not.toContain('matched-entry-quirk');
    // Request-shaping + routing fields are NOT inherited either.
    expect(entry.unsupportedParameters).toBeUndefined();
    expect(entry.maxTokensParam).toBeUndefined();
    expect(entry.cliName).toBeUndefined();
    expect(entry.cliAlias).toBeUndefined();
    expect(entry.cliModelName).toBeUndefined();
    expect(entry.aliases).toBeUndefined();
    // verifiedAt attests the CANONICAL entry, not this decorated derivation.
    expect(entry.verifiedAt).toBeUndefined();
  });

  it('does not mutate the stored canonical entry (returns a copy)', () => {
    const reg = new ModelRegistry({ inTreeEntries: [opus48Canonical] });
    reg.getEntry('Claude_Opus_4.8_hardened');
    const canonical = reg.getEntry('claude-opus-4-8');
    expect(canonical.id).toBe('claude-opus-4-8');
    expect(canonical.matchedVia).toBeUndefined();
    expect(canonical.resolvedFrom).toBeUndefined();
    expect(canonical.maxRecommendedTurnBudget).toBe(99);
  });

  it('version-less decorated id falls to derivation with no pricing', () => {
    const reg = new ModelRegistry({ inTreeEntries: [haikuVersionless] });
    const entry = reg.getEntry('claude-haiku-hardened');
    expect(entry.source).toBe('derived');
    expect(entry.matchedVia).toBeUndefined();
    expect(entry.resolvedFrom).toBeUndefined();
    expect(entry.pricing).toBeUndefined();
  });

  it('fails closed when two distinct canonical models share vendor+family+version', () => {
    const a: ModelEntry = {
      ...opus48Canonical,
      id: 'claude-opus-4-9',
      version: '4-9',
      aliases: [],
    };
    const b: ModelEntry = {
      ...opus48Canonical,
      id: 'claude-opus-4-9-preview',
      version: '4-9',
      aliases: [],
      pricing: { inputPer1M: 7, outputPer1M: 35 },
    };
    const reg = new ModelRegistry({ inTreeEntries: [a, b] });
    const entry = reg.getEntry('claude_opus_4.9_hardened');
    expect(entry.matchedVia).toBeUndefined();
    expect(entry.resolvedFrom).toBeUndefined();
    expect(entry.pricing).toBeUndefined();
    expect(entry.source).toBe('derived');
  });

  it('dedupes provider-prefixed duplicates with identical pricing before declaring ambiguity', () => {
    const reg = new ModelRegistry({
      generatedEntries: [
        generatedOpus48('anthropic/claude-opus-4-8', { inputPer1M: 5, outputPer1M: 25 }),
        generatedOpus48('gateway-x/anthropic.claude-opus-4-8-v1', {
          inputPer1M: 5,
          outputPer1M: 25,
        }),
      ],
    });
    const entry = reg.getEntry('claude-opus-4.8-hardened');
    expect(entry.matchedVia).toBe('identity');
    expect(entry.pricing).toEqual({ inputPer1M: 5, outputPer1M: 25 });
  });

  it('dedupes candidates whose ids normalize to the same canonical id', () => {
    const reg = new ModelRegistry({
      generatedEntries: [
        generatedOpus48('anthropic/claude-opus-4-8', { inputPer1M: 5, outputPer1M: 25 }),
        generatedOpus48('anthropic_claude-opus-4-8', { inputPer1M: 9, outputPer1M: 99 }),
      ],
    });
    const entry = reg.getEntry('claude-opus-4.8-hardened');
    expect(entry.matchedVia).toBe('identity');
    expect(entry.resolvedFrom).toBe('anthropic/claude-opus-4-8');
    expect(entry.pricing).toEqual({ inputPer1M: 5, outputPer1M: 25 });
  });

  it('tier order: manifest/in-tree candidate beats a generated-tier candidate', () => {
    const reg = new ModelRegistry({
      inTreeEntries: [opus48Canonical],
      generatedEntries: [
        generatedOpus48('gateway/claude-opus-4-8', { inputPer1M: 1, outputPer1M: 2 }),
      ],
    });
    const entry = reg.getEntry('Claude_Opus_4.8_hardened');
    expect(entry.resolvedFrom).toBe('claude-opus-4-8');
    expect(entry.pricing).toEqual({ inputPer1M: 5, outputPer1M: 25 });
  });

  it('tier order: a MANIFEST effective-duplicate beats its in-tree twin', () => {
    // Effective duplicates (identical pricing + contextWindow +
    // maxOutputTokens) across the authoritative bucket: the manifest
    // (operator) entry must win — the registry's maps iterate
    // lowest-priority-first, so selection must NOT rely on insertion order.
    const manifestTwin: ModelEntry = {
      ...opus48Canonical,
      id: 'operator/claude-opus-4-8',
      aliases: [],
      displayName: 'Operator Opus 4.8',
      source: 'manifest',
    };
    const reg = new ModelRegistry({
      inTreeEntries: [opus48Canonical],
      manifestEntries: [manifestTwin],
    });
    const entry = reg.getEntry('Claude_Opus_4.8_hardened');
    expect(entry.matchedVia).toBe('identity');
    expect(entry.resolvedFrom).toBe('operator/claude-opus-4-8');
    expect(entry.displayName).toBe('Operator Opus 4.8');
  });

  it('tier order: a models-dev effective-duplicate beats its generated twin', () => {
    const generatedTwin: ModelEntry = {
      ...opus40Snapshot,
      id: 'litellm/claude-opus-4-0',
      displayName: 'LiteLLM Opus 4.0',
      source: 'generated',
    };
    const reg = new ModelRegistry({
      modelsDevEntries: [opus40Snapshot],
      generatedEntries: [generatedTwin],
    });
    const entry = reg.getEntry('claude-opus-4.0-hardened');
    expect(entry.matchedVia).toBe('identity');
    expect(entry.resolvedFrom).toBe('claude-opus-4-0');
    expect(entry.displayName).toBe('Claude Opus 4 (latest)');
  });

  it('fails closed for same-price DISTINCT models (different context windows)', () => {
    // Identical pricing alone must not collapse a GA/preview pair whose
    // routing-relevant capability data (contextWindow) differs.
    const ga: ModelEntry = {
      ...opus48Canonical,
      id: 'claude-opus-4-9',
      version: '4-9',
      aliases: [],
      contextWindow: 200_000,
    };
    const preview: ModelEntry = {
      ...opus48Canonical,
      id: 'claude-opus-4-9-preview',
      version: '4-9',
      aliases: [],
      contextWindow: 1_000_000,
    };
    const reg = new ModelRegistry({ inTreeEntries: [ga, preview] });
    const entry = reg.getEntry('claude-opus-4.9-hardened');
    expect(entry.matchedVia).toBeUndefined();
    expect(entry.resolvedFrom).toBeUndefined();
    expect(entry.pricing).toBeUndefined();
    expect(entry.source).toBe('derived');
  });

  it('falls back to the generated tier only when no authoritative candidate exists', () => {
    const reg = new ModelRegistry({
      generatedEntries: [
        generatedOpus48('gateway/claude-opus-4-8', { inputPer1M: 1, outputPer1M: 2 }),
      ],
    });
    const entry = reg.getEntry('Claude_Opus_4.8_hardened');
    expect(entry.matchedVia).toBe('identity');
    expect(entry.resolvedFrom).toBe('gateway/claude-opus-4-8');
    expect(entry.pricing).toEqual({ inputPer1M: 1, outputPer1M: 2 });
    // Breadth-tier match still merges with derivation (never returned raw).
    expect(entry.source).toBe('derived');
    expect(entry.toolDefinitionFormat).toBe('anthropic');
  });

  it('ids longer than 256 chars skip the fuzzy tier entirely (no crash)', () => {
    const reg = new ModelRegistry({ inTreeEntries: [opus48Canonical] });
    const longId = `claude-opus-4-8-${'h'.repeat(300)}`;
    const entry = reg.getEntry(longId);
    expect(entry.id).toBe(longId);
    expect(entry.source).toBe('derived');
    expect(entry.matchedVia).toBeUndefined();
    expect(entry.pricing).toBeUndefined();
  });
});

// ============================================================================
// #4183 — fuzzy-resolution follow-ups: dated decorations match their
// canonical (ONE trailing date segment stripped, fail-closed for
// snapshot-style dated canonicals), and sub-SKU decorations (size/tier
// quirk absent from the canonical) fail closed instead of inheriting the
// full SKU's pricing.
// ============================================================================

/** Snapshot-style canonical whose version IS the date (gpt-4o-2024-08-06). */
const gpt4oDatedSnapshot: ModelEntry = {
  id: 'gpt-4o-2024-08-06',
  vendor: 'openai',
  family: 'gpt-4o',
  version: '2024-08-06',
  displayName: 'GPT-4o (2024-08-06)',
  contextWindow: 128_000,
  maxOutputTokens: 16_384,
  pricing: { inputPer1M: 2.5, outputPer1M: 10 },
  parallelToolCalls: true,
  promptCaching: 'none',
  toolDefinitionFormat: 'openai',
  maxRecommendedTurnBudget: 10,
  strictJson: true,
  quirks: [],
  profileId: 'gpt-4o',
  source: 'in-tree',
};

/** Canonical gateway sub-SKU that carries a size quirk ('lite') itself. */
const haikuLiteCanonical: ModelEntry = {
  id: 'claude-haiku-4-5-lite',
  vendor: 'anthropic',
  family: 'claude-haiku',
  version: '4-5',
  displayName: 'Claude Haiku 4.5 Lite (gateway SKU)',
  contextWindow: 200_000,
  maxOutputTokens: 32_000,
  pricing: { inputPer1M: 0.5, outputPer1M: 2.5 },
  parallelToolCalls: true,
  promptCaching: 'ephemeral',
  toolDefinitionFormat: 'anthropic',
  maxRecommendedTurnBudget: 8,
  strictJson: true,
  quirks: [],
  profileId: 'claude-haiku',
  source: 'manifest',
};

describe('ModelRegistry — dated decorations (#4183)', () => {
  it.each(['claude-opus-4-8-20250514', 'anthropic/Claude_Opus_4.8_20250514'])(
    'dated decoration %s matches its canonical (one trailing date segment stripped)',
    (decorated) => {
      const reg = new ModelRegistry({ inTreeEntries: [opus48Canonical] });
      const entry = reg.getEntry(decorated);
      expect(entry.id).toBe(decorated); // caller's id preserved
      expect(entry.matchedVia).toBe('identity');
      expect(entry.resolvedFrom).toBe('claude-opus-4-8');
      expect(entry.pricing).toEqual({ inputPer1M: 5, outputPer1M: 25 });
    }
  );

  it('dated decoration with the WRONG base version fails closed', () => {
    const reg = new ModelRegistry({ inTreeEntries: [opus48Canonical] });
    const entry = reg.getEntry('claude-opus-4-9-20250514');
    expect(entry.matchedVia).toBeUndefined();
    expect(entry.resolvedFrom).toBeUndefined();
    expect(entry.pricing).toBeUndefined();
    expect(entry.source).toBe('derived');
  });

  it('canonical whose version IS dated still requires full version equality', () => {
    const reg = new ModelRegistry({ inTreeEntries: [gpt4oDatedSnapshot] });
    // Exact hit and full-equality decorated hit keep working.
    expect(reg.getEntry('gpt-4o-2024-08-06').pricing).toEqual({
      inputPer1M: 2.5,
      outputPer1M: 10,
    });
    const fullEquality = reg.getEntry('gpt-4o-2024-08-06-hardened');
    expect(fullEquality.matchedVia).toBe('identity');
    expect(fullEquality.resolvedFrom).toBe('gpt-4o-2024-08-06');
    // But an EXTRA trailing date segment must not strip its way onto the
    // snapshot entry — the canonical side's version carries the date.
    const extraDate = reg.getEntry('gpt-4o-2024-08-06-20250101');
    expect(extraDate.matchedVia).toBeUndefined();
    expect(extraDate.pricing).toBeUndefined();
    expect(extraDate.source).toBe('derived');
  });

  it('date-stripped fallback keeps ambiguity rules: two distinct candidates fail closed', () => {
    const a: ModelEntry = {
      ...opus48Canonical,
      id: 'claude-opus-4-9',
      version: '4-9',
      aliases: [],
    };
    const b: ModelEntry = {
      ...opus48Canonical,
      id: 'claude-opus-4-9-preview',
      version: '4-9',
      aliases: [],
      pricing: { inputPer1M: 7, outputPer1M: 35 },
    };
    const reg = new ModelRegistry({ inTreeEntries: [a, b] });
    const entry = reg.getEntry('claude-opus-4-9-20250514');
    expect(entry.matchedVia).toBeUndefined();
    expect(entry.pricing).toBeUndefined();
    expect(entry.source).toBe('derived');
  });

  it('date-stripped fallback keeps dedupe rules: effective duplicates collapse first', () => {
    const reg = new ModelRegistry({
      generatedEntries: [
        generatedOpus48('anthropic/claude-opus-4-8', { inputPer1M: 5, outputPer1M: 25 }),
        generatedOpus48('gateway-x/anthropic.claude-opus-4-8-v1', {
          inputPer1M: 5,
          outputPer1M: 25,
        }),
      ],
    });
    const entry = reg.getEntry('claude-opus-4-8-20250514');
    expect(entry.matchedVia).toBe('identity');
    expect(entry.pricing).toEqual({ inputPer1M: 5, outputPer1M: 25 });
  });
});

describe('ModelRegistry — sub-SKU fail-closed guard (#4183)', () => {
  it.each(['claude-opus-4-8-mini', 'claude-opus-4-8-lite', 'claude-opus-4-8-nano'])(
    'size-marked decoration %s no longer inherits the full SKU pricing',
    (decorated) => {
      const reg = new ModelRegistry({ inTreeEntries: [opus48Canonical] });
      const entry = reg.getEntry(decorated);
      expect(entry.matchedVia).toBeUndefined();
      expect(entry.resolvedFrom).toBeUndefined();
      expect(entry.pricing).toBeUndefined();
      expect(entry.source).toBe('derived');
    }
  );

  it('a decoration whose size quirk exists on the canonical too still matches', () => {
    const reg = new ModelRegistry({ manifestEntries: [haikuLiteCanonical] });
    const entry = reg.getEntry('claude-haiku-4-5-lite-hardened');
    expect(entry.matchedVia).toBe('identity');
    expect(entry.resolvedFrom).toBe('claude-haiku-4-5-lite');
    expect(entry.pricing).toEqual({ inputPer1M: 0.5, outputPer1M: 2.5 });
  });

  it.each(['claude-opus-4-8-thinking', 'claude-opus-4-8-high'])(
    'non-size quirk decoration %s still matches (same-SKU variant)',
    (decorated) => {
      const reg = new ModelRegistry({ inTreeEntries: [opus48Canonical] });
      const entry = reg.getEntry(decorated);
      expect(entry.matchedVia).toBe('identity');
      expect(entry.resolvedFrom).toBe('claude-opus-4-8');
      expect(entry.pricing).toEqual({ inputPer1M: 5, outputPer1M: 25 });
    }
  );

  it('the guard applies to date-stripped matches too', () => {
    const reg = new ModelRegistry({ inTreeEntries: [opus48Canonical] });
    const entry = reg.getEntry('claude-opus-4-8-20250514-mini');
    expect(entry.matchedVia).toBeUndefined();
    expect(entry.pricing).toBeUndefined();
    expect(entry.source).toBe('derived');
  });
});

describe('ModelRegistry — exact-match surfaces stay exact (#4164)', () => {
  it('hasAuthoritative stays false for decorated ids that only fuzzy-match', () => {
    const reg = new ModelRegistry({ inTreeEntries: [opus48Canonical] });
    expect(reg.hasAuthoritative('claude-opus-4-8')).toBe(true);
    expect(reg.hasAuthoritative('Claude_Opus_4-8')).toBe(false);
    expect(reg.hasAuthoritative('Claude_Opus_4.8_hardened')).toBe(false);
  });

  it('lookupInTreeCapability stays undefined for decorated ids', () => {
    setDefaultRegistry(undefined);
    try {
      expect(lookupInTreeCapability('claude-opus')).toBeDefined(); // regression
      expect(lookupInTreeCapability('CLAUDE-OPUS')).toBeUndefined();
      expect(lookupInTreeCapability('Claude_Opus_4.8_hardened')).toBeUndefined();
    } finally {
      setDefaultRegistry(undefined);
    }
  });

  it('exact and alias matches are completely unaffected (regression)', () => {
    const reg = new ModelRegistry({ inTreeEntries: [opus48Canonical] });
    const exact = reg.getEntry('claude-opus-4-8');
    expect(exact.source).toBe('in-tree');
    expect(exact.matchedVia).toBeUndefined();
    expect(exact.resolvedFrom).toBeUndefined();
    expect(exact.maxRecommendedTurnBudget).toBe(99); // authoritative values untouched
    expect(exact.unsupportedParameters).toEqual(['temperature']);
    const viaAlias = reg.getEntry('claude-opus-48-latest');
    expect(viaAlias.id).toBe('claude-opus-4-8');
    expect(viaAlias.source).toBe('in-tree');
    expect(viaAlias.matchedVia).toBeUndefined();
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
