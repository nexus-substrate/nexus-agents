/**
 * Tests for BaseAgent Context Pruning Initialization
 *
 * @module agents/base-agent-pruning-init.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  resolvePruningConfig,
  initializePruningInfrastructure,
  DEFAULT_PRUNING_CONFIG,
} from './base-agent-pruning-init.js';
import { PruningStrategy } from './context-pruner.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  } as never;
}

// ============================================================================
// resolvePruningConfig
// ============================================================================

describe('resolvePruningConfig', () => {
  it('returns defaults when no config provided', () => {
    const config = resolvePruningConfig();
    expect(config).toEqual(DEFAULT_PRUNING_CONFIG);
  });

  it('returns defaults for undefined config', () => {
    const config = resolvePruningConfig(undefined);
    expect(config).toEqual(DEFAULT_PRUNING_CONFIG);
  });

  it('merges partial config with defaults', () => {
    const config = resolvePruningConfig({ maxTokens: 50_000 });

    expect(config.maxTokens).toBe(50_000);
    expect(config.enabled).toBe(DEFAULT_PRUNING_CONFIG.enabled);
    expect(config.strategy).toBe(DEFAULT_PRUNING_CONFIG.strategy);
    expect(config.reserveTokens).toBe(DEFAULT_PRUNING_CONFIG.reserveTokens);
  });

  it('overrides strategy', () => {
    const config = resolvePruningConfig({ strategy: PruningStrategy.SLIDING_WINDOW });
    expect(config.strategy).toBe(PruningStrategy.SLIDING_WINDOW);
  });

  it('can disable pruning', () => {
    const config = resolvePruningConfig({ enabled: false });
    expect(config.enabled).toBe(false);
  });

  it('ignores undefined values in config', () => {
    const config = resolvePruningConfig({ enabled: undefined, maxTokens: 200_000 });
    expect(config.enabled).toBe(DEFAULT_PRUNING_CONFIG.enabled);
    expect(config.maxTokens).toBe(200_000);
  });

  it('overrides all fields when fully specified', () => {
    const config = resolvePruningConfig({
      enabled: false,
      strategy: PruningStrategy.HIERARCHICAL,
      maxTokens: 50_000,
      reserveTokens: 5_000,
      triggerThreshold: 0.8,
    });

    expect(config.enabled).toBe(false);
    expect(config.strategy).toBe(PruningStrategy.HIERARCHICAL);
    expect(config.maxTokens).toBe(50_000);
    expect(config.reserveTokens).toBe(5_000);
    expect(config.triggerThreshold).toBe(0.8);
  });
});

// ============================================================================
// DEFAULT_PRUNING_CONFIG
// ============================================================================

describe('DEFAULT_PRUNING_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_PRUNING_CONFIG.enabled).toBe(true);
    expect(DEFAULT_PRUNING_CONFIG.strategy).toBe(PruningStrategy.PRIORITY_WEIGHTED_AGE);
    expect(DEFAULT_PRUNING_CONFIG.maxTokens).toBe(100_000);
    expect(DEFAULT_PRUNING_CONFIG.reserveTokens).toBe(10_000);
    expect(DEFAULT_PRUNING_CONFIG.triggerThreshold).toBe(0.9);
  });
});

// ============================================================================
// initializePruningInfrastructure
// ============================================================================

describe('initializePruningInfrastructure', () => {
  it('returns undefined managers when pruning disabled', () => {
    const result = initializePruningInfrastructure({
      config: { enabled: false },
      logger: makeLogger(),
    });

    expect(result.contextPruningEnabled).toBe(false);
    expect(result.contextManager).toBeUndefined();
    expect(result.contextPruner).toBeUndefined();
    expect(result.pruningConfig.enabled).toBe(false);
  });

  it('creates context manager and pruner when enabled', () => {
    const result = initializePruningInfrastructure({
      config: { enabled: true },
      logger: makeLogger(),
    });

    expect(result.contextPruningEnabled).toBe(true);
    expect(result.contextManager).toBeDefined();
    expect(result.contextPruner).toBeDefined();
  });

  it('logs initialization message', () => {
    const logger = makeLogger();
    initializePruningInfrastructure({
      config: { enabled: true },
      logger,
    });

    expect((logger as unknown as { info: ReturnType<typeof vi.fn> }).info).toHaveBeenCalledWith(
      'Context pruning enabled',
      expect.objectContaining({
        strategy: expect.any(String) as string,
        maxTokens: expect.any(Number) as number,
      })
    );
  });

  it('uses default config when none provided', () => {
    const result = initializePruningInfrastructure({
      logger: makeLogger(),
    });

    // Default is enabled=true
    expect(result.contextPruningEnabled).toBe(true);
    expect(result.pruningConfig).toEqual(DEFAULT_PRUNING_CONFIG);
  });

  it('passes adapter to context manager when provided', () => {
    const adapter = { providerId: 'test' } as never;
    const result = initializePruningInfrastructure({
      config: { enabled: true },
      adapter,
      logger: makeLogger(),
    });

    expect(result.contextManager).toBeDefined();
    expect(result.contextPruner).toBeDefined();
  });
});
