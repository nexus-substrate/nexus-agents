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

function clearV2Env(): void {
  delete process.env['NEXUS_V2_MODE'];
  delete process.env['NEXUS_V2_DELEGATE'];
  delete process.env['NEXUS_V2_ORCHESTRATE'];
  delete process.env['NEXUS_V2_POLICY_MODE'];
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
});
