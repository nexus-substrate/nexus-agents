/**
 * PluginRegistry tests (Issue #911, Phase 3-2)
 *
 * Tests plugin registration, resolution, experimental gating,
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
  // Experimental Gating Tests
  // ==========================================================================

  describe('experimental gating', () => {
    it('blocks experimental plugins by default', () => {
      const registry = new PluginRegistry();
      const result = registry.register(
        makePlugin({
          id: 'nexus:experimental',
          trustLevel: 'experimental',
          experimental: true,
        })
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('missing_capability');
      }
    });

    it('allows experimental plugins when enabled', () => {
      const registry = new PluginRegistry({
        experimentalEnabled: true,
      });
      const result = registry.register(
        makePlugin({
          id: 'nexus:experimental',
          trustLevel: 'experimental',
          experimental: true,
        })
      );
      expect(result.ok).toBe(true);
    });

    it('allows only allowlisted experimental plugins', () => {
      const registry = new PluginRegistry({
        experimentalEnabled: true,
        experimentalAllow: ['nexus:allowed'],
      });
      const allowed = registry.register(
        makePlugin({
          id: 'nexus:allowed',
          experimental: true,
          trustLevel: 'experimental',
        })
      );
      expect(allowed.ok).toBe(true);

      const denied = registry.register(
        makePlugin({
          id: 'nexus:denied',
          experimental: true,
          trustLevel: 'experimental',
        })
      );
      expect(denied.ok).toBe(false);
    });

    it('still accepts the deprecated options and still denies when they do not open the gate (#5097)', () => {
      // Deprecated, not removed: the fields are public API, so passing them
      // must keep compiling and the denial behaviour must be unchanged.
      const registry = new PluginRegistry({ experimentalEnabled: false, experimentalAllow: [] });
      const denied = registry.register(
        makePlugin({ id: 'nexus:experimental', trustLevel: 'experimental', experimental: true })
      );
      expect(denied.ok).toBe(false);
      if (!denied.ok) {
        expect(denied.error).toEqual({
          type: 'missing_capability',
          capability: 'experimental-plugins',
        });
      }
      // A non-experimental plugin is unaffected by the deprecated options.
      expect(registry.register(makePlugin({ id: 'nexus:plain' })).ok).toBe(true);
    });
  });

  // ==========================================================================
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
