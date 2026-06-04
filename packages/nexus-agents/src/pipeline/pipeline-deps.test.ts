/**
 * Tests for resolvePipelineDeps — the explicit pipeline dependency seam (#3175).
 */
import { describe, it, expect, afterEach } from 'vitest';

import { resolvePipelineDeps } from './pipeline-deps.js';
import { getPipelinePluginRegistry, resetPipelinePluginRegistry } from './core-plugins.js';
import { PluginRegistry } from './plugin-registry.js';

afterEach(() => {
  // Keep the global registry isolated between cases.
  resetPipelinePluginRegistry();
});

describe('resolvePipelineDeps (#3175)', () => {
  it('falls back to the global PluginRegistry when none is injected', () => {
    const resolved = resolvePipelineDeps();
    // Identity: the resolved registry IS the process-global singleton, so behavior
    // is unchanged when nothing is injected.
    expect(resolved.pluginRegistry).toBe(getPipelinePluginRegistry());
  });

  it('falls back to the global default when the bundle omits pluginRegistry', () => {
    const resolved = resolvePipelineDeps({});
    expect(resolved.pluginRegistry).toBe(getPipelinePluginRegistry());
  });

  it('passes an injected pluginRegistry through untouched', () => {
    const injected = new PluginRegistry();
    const resolved = resolvePipelineDeps({ pluginRegistry: injected });
    expect(resolved.pluginRegistry).toBe(injected);
    // And it must NOT be the global singleton — the injection wins.
    expect(resolved.pluginRegistry).not.toBe(getPipelinePluginRegistry());
  });

  it('resolves a fresh global after the singleton is reset (no stale capture)', () => {
    const first = resolvePipelineDeps().pluginRegistry;
    resetPipelinePluginRegistry();
    const second = resolvePipelineDeps().pluginRegistry;
    expect(second).not.toBe(first);
    expect(second).toBe(getPipelinePluginRegistry());
  });
});
