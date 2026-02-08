/**
 * Plugin type tests (Issue #911, Phase 3-1)
 *
 * Tests for PluginManifest, PipelinePlugin, StageContext,
 * StageResult, and PluginTrustLevel types and schemas.
 */
import { describe, it, expect } from 'vitest';

import {
  PluginManifestSchema,
  StageResultSchema,
  PLUGIN_TRUST_LEVELS,
  type PluginManifest,
  type PipelinePlugin,
  type StageContext,
  type PluginTrustLevel,
  type IPluginRegistry,
  type RegistrationError,
} from './plugin-types.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'nexus:test-plugin',
    version: '1.0.0',
    description: 'A test plugin',
    stages: ['analyze'],
    requiredCapabilities: [],
    trustLevel: 'core',
    experimental: false,
    ...overrides,
  };
}

// ============================================================================
// PluginManifest Schema Tests
// ============================================================================

describe('PluginManifestSchema', () => {
  it('validates a valid core manifest', () => {
    const result = PluginManifestSchema.safeParse(makeManifest());
    expect(result.success).toBe(true);
  });

  it('validates manifest with all trust levels', () => {
    for (const level of PLUGIN_TRUST_LEVELS) {
      const result = PluginManifestSchema.safeParse(makeManifest({ trustLevel: level }));
      expect(result.success).toBe(true);
    }
  });

  it('validates manifest with multiple stages', () => {
    const result = PluginManifestSchema.safeParse(
      makeManifest({ stages: ['analyze', 'execute', 'validate'] })
    );
    expect(result.success).toBe(true);
  });

  it('validates experimental manifest', () => {
    const result = PluginManifestSchema.safeParse(
      makeManifest({
        trustLevel: 'experimental',
        experimental: true,
        requiredCapabilities: ['claude-cli'],
      })
    );
    expect(result.success).toBe(true);
  });

  it('rejects manifest with empty id', () => {
    const result = PluginManifestSchema.safeParse(makeManifest({ id: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects manifest with empty version', () => {
    const result = PluginManifestSchema.safeParse(makeManifest({ version: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects manifest with empty stages', () => {
    const result = PluginManifestSchema.safeParse(makeManifest({ stages: [] }));
    expect(result.success).toBe(false);
  });

  it('rejects manifest with invalid trust level', () => {
    const result = PluginManifestSchema.safeParse(
      makeManifest({ trustLevel: 'admin' as PluginTrustLevel })
    );
    expect(result.success).toBe(false);
  });

  it('rejects manifest with invalid stage type', () => {
    const result = PluginManifestSchema.safeParse(
      makeManifest({ stages: ['invalid'] as unknown as PluginManifest['stages'] })
    );
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// StageResult Schema Tests
// ============================================================================

describe('StageResultSchema', () => {
  it('validates a successful result', () => {
    const result = StageResultSchema.safeParse({
      success: true,
      outputArtifacts: [{ id: 'art-1', type: 'code' }],
      metadata: { duration: 100 },
    });
    expect(result.success).toBe(true);
  });

  it('validates a failed result with error', () => {
    const result = StageResultSchema.safeParse({
      success: false,
      outputArtifacts: [],
      metadata: {},
      error: 'Plugin execution failed',
    });
    expect(result.success).toBe(true);
  });

  it('validates result with empty artifacts', () => {
    const result = StageResultSchema.safeParse({
      success: true,
      outputArtifacts: [],
      metadata: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects result missing required fields', () => {
    const result = StageResultSchema.safeParse({
      success: true,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// PLUGIN_TRUST_LEVELS Tests
// ============================================================================

describe('PLUGIN_TRUST_LEVELS', () => {
  it('contains all four trust levels', () => {
    expect(PLUGIN_TRUST_LEVELS).toEqual(['core', 'standard', 'experimental', 'external']);
  });

  it('is readonly', () => {
    expect(Object.isFrozen(PLUGIN_TRUST_LEVELS)).toBe(true);
  });
});

// ============================================================================
// Type-level Tests (compile-time checks)
// ============================================================================

describe('type contracts', () => {
  it('PipelinePlugin requires manifest and execute', () => {
    const plugin: PipelinePlugin = {
      manifest: makeManifest(),
      execute: () =>
        Promise.resolve({
          success: true,
          outputArtifacts: [],
          metadata: {},
        }),
      validateConfig: () => ({ ok: true, value: undefined }),
    };
    expect(plugin.manifest.id).toBe('nexus:test-plugin');
  });

  it('StageContext shape is defined', () => {
    // Type-level assertion — we just verify the type exists
    const _check: StageContext | undefined = undefined;
    expect(_check).toBeUndefined();
  });

  it('IPluginRegistry shape is defined', () => {
    const _check: IPluginRegistry | undefined = undefined;
    expect(_check).toBeUndefined();
  });

  it('RegistrationError is a discriminated union', () => {
    const err1: RegistrationError = {
      type: 'duplicate_id',
      pluginId: 'test',
    };
    const err2: RegistrationError = {
      type: 'invalid_manifest',
      message: 'bad',
    };
    const err3: RegistrationError = {
      type: 'missing_capability',
      capability: 'claude-cli',
    };
    expect(err1.type).toBe('duplicate_id');
    expect(err2.type).toBe('invalid_manifest');
    expect(err3.type).toBe('missing_capability');
  });
});
