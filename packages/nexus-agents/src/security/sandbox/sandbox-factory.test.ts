/**
 * Tests for sandbox-factory.ts
 *
 * Post-#2551, the factory has a single in-process executor
 * (`PolicySandboxExecutor`). `container` and `deno` modes accept config
 * for back-compat but resolve to `policy` mode with a warning.
 */

import { describe, it, expect } from 'vitest';
import { createSandbox, getRecommendedMode } from './sandbox-factory.js';
import { PolicySandboxExecutor } from './sandbox-executor.js';

describe('createSandbox - none mode', () => {
  it('creates a no-op executor with enforcement disabled', async () => {
    const result = await createSandbox({ mode: 'none' });

    expect(result.executor).toBeInstanceOf(PolicySandboxExecutor);
    expect(result.actualMode).toBe('none');
    expect(result.usedFallback).toBe(false);
    expect(result.warning).toContain('no isolation');
  });

  it('includes a warning naming development as the only legitimate use', async () => {
    const result = await createSandbox({ mode: 'none' });

    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('development');
  });
});

describe('createSandbox - policy mode', () => {
  it('creates a policy executor with default config', async () => {
    const result = await createSandbox({ mode: 'policy' });

    expect(result.executor).toBeInstanceOf(PolicySandboxExecutor);
    expect(result.actualMode).toBe('policy');
    expect(result.usedFallback).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it('accepts a custom policy config', async () => {
    const result = await createSandbox({
      mode: 'policy',
      policyConfig: { enforce: false, logViolations: true },
    });

    expect(result.executor).toBeInstanceOf(PolicySandboxExecutor);
    expect(result.actualMode).toBe('policy');
  });
});

describe('createSandbox - container/deno modes are accepted but fall back', () => {
  it('treats `container` mode as a policy-mode fallback with a deprecation warning', async () => {
    const result = await createSandbox({ mode: 'container' });

    expect(result.executor).toBeInstanceOf(PolicySandboxExecutor);
    expect(result.actualMode).toBe('policy');
    expect(result.usedFallback).toBe(true);
    expect(result.warning).toContain('container');
    expect(result.warning).toContain('policy');
  });

  it('treats `deno` mode as a policy-mode fallback with a deprecation warning', async () => {
    const result = await createSandbox({ mode: 'deno' });

    expect(result.executor).toBeInstanceOf(PolicySandboxExecutor);
    expect(result.actualMode).toBe('policy');
    expect(result.usedFallback).toBe(true);
    expect(result.warning).toContain('deno');
    expect(result.warning).toContain('policy');
  });
});

describe('createSandbox - defaults', () => {
  it('defaults to policy mode when no options provided', async () => {
    const result = await createSandbox();

    expect(result.actualMode).toBe('policy');
    expect(result.executor).toBeInstanceOf(PolicySandboxExecutor);
  });
});

describe('getRecommendedMode', () => {
  it('always recommends policy mode post-#2551', () => {
    expect(getRecommendedMode()).toBe('policy');
  });
});
