/**
 * Core plugins tests (Issue #921, Phase B)
 *
 * Tests core plugin manifests, registration, and registry lifecycle.
 */
import { describe, it, expect } from 'vitest';

import {
  CORE_PLUGINS,
  TASK_ANALYZER_PLUGIN,
  MODEL_ROUTER_PLUGIN,
  CLI_EXECUTOR_PLUGIN,
  registerCorePlugins,
  createCorePluginRegistry,
  getPipelinePluginRegistry,
  resetPipelinePluginRegistry,
} from './core-plugins.js';
import { PluginRegistry } from './plugin-registry.js';

// ============================================================================
// Plugin Manifest Tests
// ============================================================================

describe('core plugin manifests', () => {
  it('defines exactly 3 core plugins', () => {
    expect(CORE_PLUGINS).toHaveLength(3);
  });

  it('task-analyzer handles analyze stages', () => {
    expect(TASK_ANALYZER_PLUGIN.manifest.id).toBe('nexus:task-analyzer');
    expect(TASK_ANALYZER_PLUGIN.manifest.stages).toEqual(['analyze']);
    expect(TASK_ANALYZER_PLUGIN.manifest.trustLevel).toBe('core');
    expect(TASK_ANALYZER_PLUGIN.manifest.experimental).toBe(false);
  });

  it('model-router handles route stages', () => {
    expect(MODEL_ROUTER_PLUGIN.manifest.id).toBe('nexus:model-router');
    expect(MODEL_ROUTER_PLUGIN.manifest.stages).toEqual(['route']);
    expect(MODEL_ROUTER_PLUGIN.manifest.trustLevel).toBe('core');
  });

  it('cli-executor handles execute stages', () => {
    expect(CLI_EXECUTOR_PLUGIN.manifest.id).toBe('nexus:cli-executor');
    expect(CLI_EXECUTOR_PLUGIN.manifest.stages).toEqual(['execute']);
    expect(CLI_EXECUTOR_PLUGIN.manifest.trustLevel).toBe('core');
  });

  it('all plugins have valid version strings', () => {
    for (const plugin of CORE_PLUGINS) {
      expect(plugin.manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('all plugins have unique IDs', () => {
    const ids = CORE_PLUGINS.map((p) => p.manifest.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all plugins pass config validation', () => {
    for (const plugin of CORE_PLUGINS) {
      const result = plugin.validateConfig(undefined);
      expect(result.ok).toBe(true);
    }
  });
});

// ============================================================================
// Registration Tests
// ============================================================================

describe('registerCorePlugins', () => {
  it('registers all core plugins into a new registry', () => {
    const registry = new PluginRegistry();
    const result = registerCorePlugins(registry);
    expect(result.registered).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('freezes registry after registration', () => {
    const registry = new PluginRegistry();
    registerCorePlugins(registry);
    expect(registry.frozen).toBe(true);
  });

  it('makes plugins resolvable after registration', () => {
    const registry = new PluginRegistry();
    registerCorePlugins(registry);
    expect(registry.resolve('nexus:task-analyzer')).toBeDefined();
    expect(registry.resolve('nexus:model-router')).toBeDefined();
    expect(registry.resolve('nexus:cli-executor')).toBeDefined();
  });

  it('lists all enabled plugins', () => {
    const registry = new PluginRegistry();
    registerCorePlugins(registry);
    const enabled = registry.listEnabled();
    expect(enabled).toHaveLength(3);
  });

  it('creates default registry when no argument provided', () => {
    const result = registerCorePlugins();
    expect(result.registered).toBe(3);
  });
});

// ============================================================================
// Convenience Factory Tests
// ============================================================================

describe('createCorePluginRegistry', () => {
  it('returns a frozen registry with 3 plugins', () => {
    const registry = createCorePluginRegistry();
    expect(registry.frozen).toBe(true);
    expect(registry.listEnabled()).toHaveLength(3);
  });

  it('startup overhead is under 50ms', () => {
    const start = Date.now();
    createCorePluginRegistry();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

// ============================================================================
// Singleton Tests (#1179)
// ============================================================================

describe('getPipelinePluginRegistry', () => {
  it('returns the same instance on repeated calls', () => {
    resetPipelinePluginRegistry();
    const a = getPipelinePluginRegistry();
    const b = getPipelinePluginRegistry();
    expect(a).toBe(b);
  });

  it('returns a frozen registry with 3 core plugins', () => {
    resetPipelinePluginRegistry();
    const registry = getPipelinePluginRegistry();
    expect(registry.frozen).toBe(true);
    expect(registry.listEnabled()).toHaveLength(3);
  });

  it('returns a new instance after reset', () => {
    const a = getPipelinePluginRegistry();
    resetPipelinePluginRegistry();
    const b = getPipelinePluginRegistry();
    expect(a).not.toBe(b);
  });
});

// ============================================================================
// Plugin Execution Tests (no-op stubs)
// ============================================================================

describe('core plugin execute (no-op stubs)', () => {
  it('task-analyzer returns success stub', async () => {
    const stage = {
      id: 'test',
      type: 'analyze' as const,
      pluginId: 'nexus:task-analyzer',
      inputArtifacts: [],
      outputArtifacts: [],
      dependencies: [],
      config: {},
    };
    const ctx = {
      signal: AbortSignal.timeout(5000),
      task: {
        id: 'test',
        description: 'test',
        status: 'approved' as const,
        analysis: { complexity: 'low', taskType: 'code', ambiguityScore: 0 },
        constraints: { scope: [] },
        requiredCapabilities: { tools: [], experts: [] },
        capabilityGaps: { available: { tools: [], experts: [] }, gaps: [], allSatisfied: true },
        artifacts: [],
        metadata: {},
        createdAt: 0,
        updatedAt: 0,
      },
      config: {},
    };
    const result = await TASK_ANALYZER_PLUGIN.execute(stage, ctx);
    expect(result.success).toBe(true);
    expect(result.metadata['stub']).toBe(true);
  });
});
