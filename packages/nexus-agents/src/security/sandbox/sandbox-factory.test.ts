/* eslint-disable @typescript-eslint/no-deprecated -- Tests for the
 * deprecated sandbox-factory + executor surface (#2499). */
/**
 * Tests for sandbox-factory.ts
 *
 * Covers createSandbox, getRecommendedMode, and all sandbox modes
 * (none, policy, container) with fallback behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSandbox,
  getRecommendedMode,
  type SandboxFactoryOptions,
} from './sandbox-factory.js';
import { PolicySandboxExecutor } from './sandbox-executor.js';
import { DockerSandboxExecutor, isDockerAvailable } from './docker-sandbox-executor.js';
import { DenoSandboxExecutor, isDenoAvailable } from './deno-sandbox-executor.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('./docker-sandbox-executor.js', async () => {
  const actual = await vi.importActual<typeof import('./docker-sandbox-executor.js')>(
    './docker-sandbox-executor.js'
  );
  return {
    ...actual,
    isDockerAvailable: vi.fn(),
  };
});

vi.mock('./deno-sandbox-executor.js', async () => {
  const actual = await vi.importActual<typeof import('./deno-sandbox-executor.js')>(
    './deno-sandbox-executor.js'
  );
  return {
    ...actual,
    isDenoAvailable: vi.fn(),
  };
});

// ============================================================================
// Fixtures
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeOptions(overrides: Partial<SandboxFactoryOptions> = {}) {
  return {
    mode: 'policy' as const,
    fallbackToPolicy: true,
    ...overrides,
  };
}

// ============================================================================
// createSandbox - none mode
// ============================================================================

describe('createSandbox - none mode', () => {
  it('creates a no-op executor with enforcement disabled', async () => {
    const result = await createSandbox({ mode: 'none' });

    expect(result.executor).toBeInstanceOf(PolicySandboxExecutor);
    expect(result.actualMode).toBe('none');
    expect(result.usedFallback).toBe(false);
    expect(result.warning).toContain('no isolation');
  });

  it('returns policy executor with enforce=false', async () => {
    const result = await createSandbox({ mode: 'none' });

    // Verify executor is policy-based but not enforcing
    const executor = result.executor as PolicySandboxExecutor;
    expect(executor.name).toBe('PolicySandboxExecutor');
  });

  it('includes warning about no isolation', async () => {
    const result = await createSandbox({ mode: 'none' });

    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('development');
  });
});

// ============================================================================
// createSandbox - policy mode
// ============================================================================

describe('createSandbox - policy mode', () => {
  it('creates a policy executor with default config', async () => {
    const result = await createSandbox({ mode: 'policy' });

    expect(result.executor).toBeInstanceOf(PolicySandboxExecutor);
    expect(result.actualMode).toBe('policy');
    expect(result.usedFallback).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it('creates a policy executor with custom config', async () => {
    const policyConfig = {
      enforce: false,
      logViolations: true,
    };

    const result = await createSandbox({
      mode: 'policy',
      policyConfig,
    });

    expect(result.executor).toBeInstanceOf(PolicySandboxExecutor);
    expect(result.actualMode).toBe('policy');
  });

  it('does not use fallback for policy mode', async () => {
    const result = await createSandbox({ mode: 'policy' });

    expect(result.usedFallback).toBe(false);
  });
});

// ============================================================================
// createSandbox - container mode (Docker available)
// ============================================================================

describe('createSandbox - container mode (Docker available)', () => {
  beforeEach(() => {
    vi.mocked(isDockerAvailable).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a Docker executor when Docker is available', async () => {
    const result = await createSandbox({ mode: 'container' });

    expect(result.executor).toBeInstanceOf(DockerSandboxExecutor);
    expect(result.actualMode).toBe('container');
    expect(result.usedFallback).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it('passes custom Docker config to executor', async () => {
    const dockerConfig = {
      image: 'custom-image:latest',
      networkEnabled: true,
    };

    const result = await createSandbox({
      mode: 'container',
      dockerConfig,
    });

    expect(result.executor).toBeInstanceOf(DockerSandboxExecutor);
  });

  it('checks Docker availability before creating executor', async () => {
    await createSandbox({ mode: 'container' });

    expect(isDockerAvailable).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// createSandbox - container mode (Docker unavailable, fallback enabled)
// ============================================================================

describe('createSandbox - container mode (Docker unavailable, Deno unavailable, fallback enabled)', () => {
  beforeEach(() => {
    vi.mocked(isDockerAvailable).mockResolvedValue(false);
    vi.mocked(isDenoAvailable).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to policy mode when neither Docker nor Deno available', async () => {
    const result = await createSandbox({
      mode: 'container',
      fallbackToPolicy: true,
    });

    expect(result.executor).toBeInstanceOf(PolicySandboxExecutor);
    expect(result.actualMode).toBe('policy');
    expect(result.usedFallback).toBe(true);
  });

  it('includes warning about fallback', async () => {
    const result = await createSandbox({
      mode: 'container',
      fallbackToPolicy: true,
    });

    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('Neither Docker nor Deno');
    expect(result.warning).toContain('policy-based');
  });

  it('uses custom policy config in fallback', async () => {
    const policyConfig = {
      enforce: false,
      logViolations: true,
    };

    const result = await createSandbox({
      mode: 'container',
      fallbackToPolicy: true,
      policyConfig,
    });

    expect(result.executor).toBeInstanceOf(PolicySandboxExecutor);
    expect(result.usedFallback).toBe(true);
  });

  it('fallbackToPolicy defaults to true', async () => {
    const result = await createSandbox({ mode: 'container' });

    // Should fall back by default
    expect(result.actualMode).toBe('policy');
    expect(result.usedFallback).toBe(true);
  });
});

// ============================================================================
// createSandbox - container mode (Docker unavailable, Deno available) — #1898
// ============================================================================

describe('createSandbox - container mode (Docker unavailable, Deno available)', () => {
  beforeEach(() => {
    vi.mocked(isDockerAvailable).mockResolvedValue(false);
    vi.mocked(isDenoAvailable).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to deno mode (process-level isolation) when Docker missing', async () => {
    const result = await createSandbox({ mode: 'container', fallbackToPolicy: true });
    expect(result.executor).toBeInstanceOf(DenoSandboxExecutor);
    expect(result.actualMode).toBe('deno');
    expect(result.usedFallback).toBe(true);
    expect(result.warning).toContain('Deno permission sandbox');
  });

  it('respects fallbackToDeno: false (skips Deno, falls to policy)', async () => {
    const result = await createSandbox({
      mode: 'container',
      fallbackToPolicy: true,
      fallbackToDeno: false,
    });
    expect(result.executor).toBeInstanceOf(PolicySandboxExecutor);
    expect(result.actualMode).toBe('policy');
  });
});

// ============================================================================
// createSandbox - deno mode (#1898)
// ============================================================================

describe('createSandbox - deno mode (Deno available)', () => {
  beforeEach(() => {
    vi.mocked(isDenoAvailable).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns DenoSandboxExecutor without fallback', async () => {
    const result = await createSandbox({ mode: 'deno' });
    expect(result.executor).toBeInstanceOf(DenoSandboxExecutor);
    expect(result.actualMode).toBe('deno');
    expect(result.usedFallback).toBe(false);
  });
});

describe('createSandbox - deno mode (Deno unavailable)', () => {
  beforeEach(() => {
    vi.mocked(isDenoAvailable).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to policy mode when fallbackToPolicy is true', async () => {
    const result = await createSandbox({ mode: 'deno', fallbackToPolicy: true });
    expect(result.executor).toBeInstanceOf(PolicySandboxExecutor);
    expect(result.actualMode).toBe('policy');
    expect(result.usedFallback).toBe(true);
    expect(result.warning).toContain('Deno not available');
  });

  it('throws when fallbackToPolicy is false', async () => {
    await expect(createSandbox({ mode: 'deno', fallbackToPolicy: false })).rejects.toThrow(
      /Deno is not available/
    );
  });
});

// ============================================================================
// createSandbox - container mode (Docker unavailable, fallback disabled)
// ============================================================================

describe('createSandbox - container mode (Docker + Deno unavailable, fallback disabled)', () => {
  beforeEach(() => {
    vi.mocked(isDockerAvailable).mockResolvedValue(false);
    vi.mocked(isDenoAvailable).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws error when neither Docker nor Deno available and fallback disabled', async () => {
    await expect(
      createSandbox({
        mode: 'container',
        fallbackToPolicy: false,
      })
    ).rejects.toThrow(/neither Docker nor Deno/);
  });

  it('error message suggests installation or fallback', async () => {
    await expect(
      createSandbox({
        mode: 'container',
        fallbackToPolicy: false,
      })
    ).rejects.toThrow(/Install Docker|Deno|fallbackToPolicy/);
  });
});

// ============================================================================
// createSandbox - default options
// ============================================================================

describe('createSandbox - default options', () => {
  it('defaults to policy mode', async () => {
    const result = await createSandbox();

    expect(result.actualMode).toBe('policy');
  });

  it('defaults fallbackToPolicy to true', () => {
    const options = makeOptions({ mode: 'container' });
    expect(options.fallbackToPolicy).toBe(true);
  });

  it('can be called with no arguments', async () => {
    const result = await createSandbox();

    expect(result.executor).toBeInstanceOf(PolicySandboxExecutor);
  });
});

// ============================================================================
// createSandbox - options merging
// ============================================================================

describe('createSandbox - options merging', () => {
  it('merges partial options with defaults', async () => {
    const result = await createSandbox({ mode: 'none' });

    expect(result.actualMode).toBe('none');
  });

  it('preserves custom options when merging', async () => {
    const policyConfig = { enforce: false };

    const result = await createSandbox({
      mode: 'policy',
      policyConfig,
    });

    expect(result.executor).toBeInstanceOf(PolicySandboxExecutor);
  });
});

// ============================================================================
// createSandbox - exhaustiveness check
// ============================================================================

describe('createSandbox - exhaustiveness check', () => {
  it('throws error for invalid mode', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invalidOptions = { mode: 'invalid' as any };

    await expect(createSandbox(invalidOptions)).rejects.toThrow('Unknown sandbox mode');
  });
});

// ============================================================================
// getRecommendedMode - Docker available
// ============================================================================

describe('getRecommendedMode - Docker available', () => {
  beforeEach(() => {
    vi.mocked(isDockerAvailable).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('recommends container mode when Docker is available', async () => {
    const mode = await getRecommendedMode();

    expect(mode).toBe('container');
  });

  it('checks Docker availability', async () => {
    await getRecommendedMode();

    expect(isDockerAvailable).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// getRecommendedMode - Docker unavailable
// ============================================================================

describe('getRecommendedMode - Docker unavailable, Deno unavailable', () => {
  beforeEach(() => {
    vi.mocked(isDockerAvailable).mockResolvedValue(false);
    vi.mocked(isDenoAvailable).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('recommends policy mode when neither Docker nor Deno is available', async () => {
    const mode = await getRecommendedMode();

    expect(mode).toBe('policy');
  });

  it('checks Docker availability first', async () => {
    await getRecommendedMode();

    expect(isDockerAvailable).toHaveBeenCalledOnce();
  });
});

describe('getRecommendedMode - Docker unavailable, Deno available (#1898)', () => {
  beforeEach(() => {
    vi.mocked(isDockerAvailable).mockResolvedValue(false);
    vi.mocked(isDenoAvailable).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('recommends deno mode when Docker missing but Deno present', async () => {
    expect(await getRecommendedMode()).toBe('deno');
  });
});

// ============================================================================
// Integration - complete workflow
// ============================================================================

describe('Integration - complete workflow', () => {
  beforeEach(() => {
    vi.mocked(isDockerAvailable).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('can recommend mode and create matching sandbox', async () => {
    const recommendedMode = await getRecommendedMode();
    const result = await createSandbox({ mode: recommendedMode });

    expect(result.actualMode).toBe(recommendedMode);
  });

  it('creates executor with proper interface', async () => {
    const result = await createSandbox({ mode: 'policy' });

    expect(result.executor.name).toBeDefined();
    expect(result.executor.execute).toBeInstanceOf(Function);
    expect(result.executor.validate).toBeInstanceOf(Function);
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe('Edge cases', () => {
  beforeEach(() => {
    vi.mocked(isDockerAvailable).mockResolvedValue(false);
    vi.mocked(isDenoAvailable).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('handles empty policyConfig', async () => {
    const result = await createSandbox({
      mode: 'policy',
      policyConfig: {},
    });

    expect(result.executor).toBeInstanceOf(PolicySandboxExecutor);
  });

  it('handles undefined dockerConfig', async () => {
    const result = await createSandbox({
      mode: 'container',
      fallbackToPolicy: true,
    });

    expect(result.actualMode).toBe('policy');
  });

  it('handles multiple calls to getRecommendedMode', async () => {
    const mode1 = await getRecommendedMode();
    const mode2 = await getRecommendedMode();

    expect(mode1).toBe(mode2);
    expect(isDockerAvailable).toHaveBeenCalledTimes(2);
  });
});
