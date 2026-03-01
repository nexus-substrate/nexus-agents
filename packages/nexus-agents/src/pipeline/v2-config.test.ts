/**
 * V2 Config tests (Issue #925, Phase F)
 *
 * Tests umbrella mode flag resolution.
 */
import { describe, it, expect, afterEach } from 'vitest';

import { resolveV2Config } from './v2-config.js';

// ============================================================================
// Helpers
// ============================================================================

const savedMode = process.env['NEXUS_V2_MODE'];
const savedDelegate = process.env['NEXUS_V2_DELEGATE'];
const savedOrchestrate = process.env['NEXUS_V2_ORCHESTRATE'];
const savedPolicy = process.env['NEXUS_V2_POLICY_MODE'];
const savedAorchestra = process.env['NEXUS_AORCHESTRA'];
const savedDispatch = process.env['NEXUS_AORCHESTRA_DISPATCH'];

function clearV2Env(): void {
  delete process.env['NEXUS_V2_MODE'];
  delete process.env['NEXUS_V2_DELEGATE'];
  delete process.env['NEXUS_V2_ORCHESTRATE'];
  delete process.env['NEXUS_V2_POLICY_MODE'];
  delete process.env['NEXUS_AORCHESTRA'];
  delete process.env['NEXUS_AORCHESTRA_DISPATCH'];
}

function setEnv(overrides: Record<string, string>): void {
  clearV2Env();
  for (const [key, val] of Object.entries(overrides)) {
    process.env[key] = val;
  }
}

function restoreEnv(): void {
  clearV2Env();
  if (savedMode !== undefined) process.env['NEXUS_V2_MODE'] = savedMode;
  if (savedDelegate !== undefined) process.env['NEXUS_V2_DELEGATE'] = savedDelegate;
  if (savedOrchestrate !== undefined) process.env['NEXUS_V2_ORCHESTRATE'] = savedOrchestrate;
  if (savedPolicy !== undefined) process.env['NEXUS_V2_POLICY_MODE'] = savedPolicy;
  if (savedAorchestra !== undefined) process.env['NEXUS_AORCHESTRA'] = savedAorchestra;
  if (savedDispatch !== undefined) process.env['NEXUS_AORCHESTRA_DISPATCH'] = savedDispatch;
}

afterEach(() => {
  restoreEnv();
});

// ============================================================================
// Tests
// ============================================================================

describe('resolveV2Config', () => {
  it('defaults to full mode', () => {
    setEnv({});
    const config = resolveV2Config();
    expect(config.mode).toBe('full');
    expect(config.delegateEnabled).toBe(true);
    expect(config.orchestrateEnabled).toBe(true);
    expect(config.policyMode).toBe('block');
    expect(config.aorchestraEnabled).toBe(true);
    expect(config.dispatchEnabled).toBe(true);
  });

  it('partial mode: delegate on, orchestrate off, warn policy', () => {
    setEnv({ NEXUS_V2_MODE: 'partial' });
    const config = resolveV2Config();
    expect(config.mode).toBe('partial');
    expect(config.delegateEnabled).toBe(true);
    expect(config.orchestrateEnabled).toBe(false);
    expect(config.policyMode).toBe('warn');
  });

  it('off mode: everything disabled', () => {
    setEnv({ NEXUS_V2_MODE: 'off' });
    const config = resolveV2Config();
    expect(config.mode).toBe('off');
    expect(config.delegateEnabled).toBe(false);
    expect(config.orchestrateEnabled).toBe(false);
    expect(config.policyMode).toBe('off');
  });

  it('individual flags override umbrella', () => {
    setEnv({
      NEXUS_V2_MODE: 'off',
      NEXUS_V2_DELEGATE: 'true',
      NEXUS_V2_ORCHESTRATE: 'true',
      NEXUS_V2_POLICY_MODE: 'block',
    });
    const config = resolveV2Config();
    expect(config.mode).toBe('off');
    expect(config.delegateEnabled).toBe(true);
    expect(config.orchestrateEnabled).toBe(true);
    expect(config.policyMode).toBe('block');
  });

  it('individual flags can disable in full mode', () => {
    setEnv({
      NEXUS_V2_MODE: 'full',
      NEXUS_V2_DELEGATE: 'false',
      NEXUS_V2_ORCHESTRATE: 'false',
      NEXUS_V2_POLICY_MODE: 'off',
    });
    const config = resolveV2Config();
    expect(config.delegateEnabled).toBe(false);
    expect(config.orchestrateEnabled).toBe(false);
    expect(config.policyMode).toBe('off');
  });

  it('invalid umbrella value defaults to full', () => {
    setEnv({ NEXUS_V2_MODE: 'invalid' });
    const config = resolveV2Config();
    expect(config.mode).toBe('full');
  });

  it('policy warn explicit override in full mode', () => {
    setEnv({ NEXUS_V2_POLICY_MODE: 'warn' });
    const config = resolveV2Config();
    expect(config.policyMode).toBe('warn');
  });

  it('aorchestra defaults to true (#1321)', () => {
    setEnv({});
    const config = resolveV2Config();
    expect(config.aorchestraEnabled).toBe(true);
  });

  it('aorchestra can be disabled via NEXUS_AORCHESTRA=false', () => {
    setEnv({ NEXUS_AORCHESTRA: 'false' });
    const config = resolveV2Config();
    expect(config.aorchestraEnabled).toBe(false);
  });

  it('dispatch defaults to true (#1321)', () => {
    setEnv({});
    const config = resolveV2Config();
    expect(config.dispatchEnabled).toBe(true);
  });

  it('dispatch can be disabled via NEXUS_AORCHESTRA_DISPATCH=false', () => {
    setEnv({ NEXUS_AORCHESTRA_DISPATCH: 'false' });
    const config = resolveV2Config();
    expect(config.dispatchEnabled).toBe(false);
  });

  it('dispatch enabled via explicit NEXUS_AORCHESTRA_DISPATCH=true', () => {
    setEnv({ NEXUS_AORCHESTRA_DISPATCH: 'true' });
    const config = resolveV2Config();
    expect(config.dispatchEnabled).toBe(true);
  });
});
