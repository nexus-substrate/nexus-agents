/**
 * PluginRegistry tests (Issue #911, Phase 3-2)
 *
 * Tests plugin registration, resolution, manifest validation,
 * registry freeze, and error cases.
 */
import { describe, it, expect } from 'vitest';

import { PluginRegistry } from './plugin-registry.js';
import type { PipelinePlugin, PluginManifest, StageResult } from './plugin-types.js';
import type { StageSpec } from './task-contract.js';

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

function makePlugin(overrides: Partial<PluginManifest> = {}): PipelinePlugin {
  return {
    manifest: makeManifest(overrides),
    execute: (_stage: StageSpec): Promise<StageResult> =>
      Promise.resolve({
        success: true,
        outputArtifacts: [],
        metadata: {},
      }),
    validateConfig: () => ({ ok: true, value: undefined }),
  };
}

// ============================================================================
// Registration Tests
// ============================================================================

describe('PluginRegistry', () => {
  describe('register', () => {
    it('accepts empty options for constructor compatibility (#5496)', () => {
      const registry = new PluginRegistry({});
      expect(registry.register(makePlugin())).toEqual({ ok: true, value: undefined });
    });

    it('registers a valid plugin', () => {
      const registry = new PluginRegistry();
      const result = registry.register(makePlugin());
      expect(result.ok).toBe(true);
    });

    it('rejects duplicate plugin IDs', () => {
      const registry = new PluginRegistry();
      registry.register(makePlugin({ id: 'nexus:dup' }));
      const result = registry.register(makePlugin({ id: 'nexus:dup' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('duplicate_id');
      }
    });

    it('rejects registration after freeze', () => {
      const registry = new PluginRegistry();
      registry.freeze();
      const result = registry.register(makePlugin());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('registry_frozen');
      }
    });

    it('rejects plugin with failed config validation', () => {
      const plugin = makePlugin();
      plugin.validateConfig = () => ({
        ok: false,
        error: { message: 'Bad config' },
      });
      const registry = new PluginRegistry();
      const result = registry.register(plugin);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('validation_failed');
      }
    });
  });

  // ==========================================================================
  // Resolution Tests
  // ==========================================================================

  describe('resolve', () => {
    it('resolves a registered plugin', () => {
      const registry = new PluginRegistry();
      registry.register(makePlugin({ id: 'nexus:resolver' }));
      const plugin = registry.resolve('nexus:resolver');
      expect(plugin).toBeDefined();
      expect(plugin?.manifest.id).toBe('nexus:resolver');
    });

    it('returns undefined for unregistered plugin', () => {
      const registry = new PluginRegistry();
      expect(registry.resolve('nexus:missing')).toBeUndefined();
    });
  });

  // ==========================================================================
  // Experimental Manifest Tests
  // ============================================================================

  describe('experimental manifests', () => {
    it('registers experimental plugins without gate options (#5496)', () => {
      const registry = new PluginRegistry();
      const plugin = makePlugin({
        id: 'nexus:experimental',
        trustLevel: 'experimental',
        experimental: true,
      });
      expect(registry.register(plugin)).toEqual({ ok: true, value: undefined });
      expect(registry.resolve(plugin.manifest.id)).toBe(plugin);
      expect(registry.isEnabled(plugin.manifest.id)).toBe(true);
    });

    it('still validates experimental plugin configuration', () => {
      const registry = new PluginRegistry();
      const plugin = makePlugin({ experimental: true, trustLevel: 'experimental' });
      plugin.validateConfig = () => ({ ok: false, error: { message: 'Bad config' } });
      expect(registry.register(plugin)).toEqual({
        ok: false,
        error: { type: 'validation_failed', message: 'Bad config' },
      });
      expect(registry.listEnabled()).toEqual([]);
    });
  });

  // ============================================================================
  // List & Query Tests
  // ==========================================================================

  describe('listEnabled', () => {
    it('lists all registered plugin manifests', () => {
      const registry = new PluginRegistry();
      registry.register(makePlugin({ id: 'nexus:a' }));
      registry.register(makePlugin({ id: 'nexus:b' }));
      const manifests = registry.listEnabled();
      expect(manifests).toHaveLength(2);
    });

    it('returns empty array when no plugins', () => {
      const registry = new PluginRegistry();
      expect(registry.listEnabled()).toHaveLength(0);
    });
  });

  describe('isEnabled', () => {
    it('returns true for registered plugin', () => {
      const registry = new PluginRegistry();
      registry.register(makePlugin({ id: 'nexus:check' }));
      expect(registry.isEnabled('nexus:check')).toBe(true);
    });

    it('returns false for unregistered plugin', () => {
      const registry = new PluginRegistry();
      expect(registry.isEnabled('nexus:missing')).toBe(false);
    });
  });

  // ==========================================================================
  // Freeze Tests
  // ==========================================================================

  describe('freeze', () => {
    it('sets frozen flag', () => {
      const registry = new PluginRegistry();
      expect(registry.frozen).toBe(false);
      registry.freeze();
      expect(registry.frozen).toBe(true);
    });

    it('still allows resolve after freeze', () => {
      const registry = new PluginRegistry();
      registry.register(makePlugin({ id: 'nexus:pre' }));
      registry.freeze();
      expect(registry.resolve('nexus:pre')).toBeDefined();
    });
  });
});
