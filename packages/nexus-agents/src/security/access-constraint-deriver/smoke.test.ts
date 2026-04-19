/**
 * End-to-end smoke tests for the access-constraint-deriver pipeline
 * (#1977 — closes condition 7 coverage for integrated paths).
 *
 * Exercises the full derivation flow with a mocked IModelAdapter:
 * - Happy path: Tier 1 + LLM returns JSON → LLM-derived policy
 * - LLM error → regex fallback
 * - LLM timeout → regex fallback
 * - LLM returns garbage → regex fallback (parse error)
 * - Tier 3 input → regex fallback, never calls LLM
 * - Cache hit on repeat → skips LLM entirely
 * - Denylist wins even over LLM-allowed tools
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IModelAdapter } from '../../core/types/model.js';
import { checkAccess, deriveAccessPolicy, deriveWithTelemetry, resetPolicyCache } from './index.js';

function makeAdapter(
  behavior: 'success' | 'error' | 'timeout' | 'garbage' | 'unsafe'
): IModelAdapter {
  const complete = vi.fn(async (_req: unknown) => {
    if (behavior === 'error') {
      return { ok: false as const, error: { code: 'MODEL_ERROR', message: 'boom' } as never };
    }
    if (behavior === 'timeout') {
      await new Promise((r) => setTimeout(r, 2000));
      return { ok: true as const, value: { text: '{}' } as never };
    }
    if (behavior === 'garbage') {
      return { ok: true as const, value: { text: 'not json at all' } as never };
    }
    if (behavior === 'unsafe') {
      // LLM tries to "allow" a path we should deny via unbypassable denylist.
      const payload = JSON.stringify({
        tool_categories: ['read', 'write', 'exec'],
        file_scope: ['~/.ssh/**', '**/.env'],
        network_scope: ['none'],
        rationale: 'compromised LLM output',
      });
      return { ok: true as const, value: { text: payload } as never };
    }
    const payload = JSON.stringify({
      tool_categories: ['read', 'search'],
      file_scope: ['src/**', 'docs/**'],
      network_scope: ['none'],
      rationale: 'read-only repo exploration',
    });
    return { ok: true as const, value: { text: payload } as never };
  });

  return {
    providerId: 'mock',
    modelId: 'mock-haiku',
    capabilities: [],
    complete,
    stream: (() => (async function* () {})()) as never,
    countTokens: () => Promise.resolve(0),
    validateConfig: () => ({ ok: true as const, value: undefined }),
  } as IModelAdapter;
}

beforeEach(() => {
  resetPolicyCache();
});

describe('smoke: happy path — Tier 1 objective + successful LLM', () => {
  it('returns an LLM-derived policy', async () => {
    const adapter = makeAdapter('success');
    const { policy, telemetry } = await deriveWithTelemetry('explore the src/ tree', {
      trustTier: '1',
      adapter,
      mode: 'audit',
    });
    expect(policy.source).toBe('llm');
    expect(policy.allowedPathPatterns).toContain('src/**');
    expect(policy.allowedOperations).toContain('read');
    expect(telemetry.source).toBe('llm');
    expect(telemetry.trustDecision).toBe('llm');
    expect(telemetry.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('smoke: LLM error → regex fallback', () => {
  it('falls back to the regex deriver', async () => {
    const adapter = makeAdapter('error');
    const { policy, telemetry } = await deriveWithTelemetry('view the router config', {
      trustTier: '1',
      adapter,
      mode: 'audit',
    });
    expect(policy.source).toBe('fallback-keyword');
    expect(telemetry.source).toBe('fallback-keyword');
    expect(telemetry.fallbackReason).toContain('llm-error');
  });
});

describe('smoke: LLM timeout → regex fallback', () => {
  it('aborts and falls back', async () => {
    const adapter = makeAdapter('timeout');
    const { policy, telemetry } = await deriveWithTelemetry('summarize the changes', {
      trustTier: '1',
      adapter,
      mode: 'audit',
      timeoutMs: 60,
    });
    expect(policy.source).toBe('fallback-keyword');
    expect(telemetry.fallbackReason).toContain('llm-timeout');
    // Timeout must actually bound the call; allow generous slack for CI variance.
    expect(telemetry.latencyMs).toBeLessThan(1500);
  });
});

describe('smoke: LLM garbage → parse error → regex fallback', () => {
  it('falls back on parse failure', async () => {
    const adapter = makeAdapter('garbage');
    const { policy, telemetry } = await deriveWithTelemetry('read the README', {
      trustTier: '1',
      adapter,
      mode: 'audit',
    });
    expect(policy.source).toBe('fallback-keyword');
    expect(telemetry.fallbackReason).toContain('llm-parse-error');
  });
});

describe('smoke: Tier 3 input never calls LLM', () => {
  it('uses fallback directly, adapter never invoked', async () => {
    const adapter = makeAdapter('success');
    // Use explicit spy to assert zero calls.
    const spy = vi.spyOn(adapter, 'complete');
    const { policy, telemetry } = await deriveWithTelemetry('close the issue as requested', {
      trustTier: '3',
      adapter,
      mode: 'audit',
    });
    expect(spy).not.toHaveBeenCalled();
    expect(policy.source).toBe('fallback-keyword');
    expect(telemetry.trustDecision).toBe('fallback-only');
    expect(telemetry.fallbackReason).toContain('trust-tier-3');
  });
});

describe('smoke: cache hit on repeat', () => {
  it('second call returns cached policy, does not call LLM again', async () => {
    const adapter = makeAdapter('success');
    const spy = vi.spyOn(adapter, 'complete');

    await deriveAccessPolicy('list the memory backends', {
      trustTier: '1',
      adapter,
      mode: 'audit',
    });
    const second = await deriveWithTelemetry('list the memory backends', {
      trustTier: '1',
      adapter,
      mode: 'audit',
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(second.telemetry.trustDecision).toBe('cache-hit');
  });
});

describe('smoke: denylist wins over LLM-derived allowlist', () => {
  it('denies ~/.ssh/** even when LLM grants access', async () => {
    const adapter = makeAdapter('unsafe');
    const { policy } = await deriveWithTelemetry('help me debug SSH', {
      trustTier: '1',
      adapter,
      mode: 'enforce',
    });
    // LLM said allow SSH keys, but enforcer denies via unbypassable path list.
    const decision = checkAccess('read_file', policy, { path: '~/.ssh/id_rsa' });
    expect(decision.decision).toBe('deny');
    if (decision.decision === 'deny') {
      expect(decision.matchedRule).toBe('unbypassable:path');
    }
  });

  it('denies destructive tools even when LLM grants access', async () => {
    const adapter = makeAdapter('unsafe');
    const { policy } = await deriveWithTelemetry('force push the branch', {
      trustTier: '1',
      adapter,
      mode: 'enforce',
    });
    const decision = checkAccess('git_push_force', policy);
    expect(decision.decision).toBe('deny');
    if (decision.decision === 'deny') {
      expect(decision.matchedRule).toBe('unbypassable:tool');
    }
  });
});

describe('smoke: off-mode short-circuit', () => {
  it('returns bypass policy regardless of trust tier, never calls LLM', async () => {
    const adapter = makeAdapter('success');
    const spy = vi.spyOn(adapter, 'complete');
    const { policy, telemetry } = await deriveWithTelemetry('anything', {
      trustTier: '1',
      adapter,
      mode: 'off',
    });
    expect(policy.source).toBe('bypass');
    expect(policy.allowedTools).toBe('*');
    expect(spy).not.toHaveBeenCalled();
    expect(telemetry.source).toBe('bypass');
  });
});

describe('smoke: telemetry', () => {
  it('records non-negative latencyMs', async () => {
    const adapter = makeAdapter('success');
    const { telemetry } = await deriveWithTelemetry('read something', {
      trustTier: '1',
      adapter,
      mode: 'audit',
    });
    expect(telemetry.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('indicates cache-hit for repeat invocations', async () => {
    const adapter = makeAdapter('success');
    await deriveAccessPolicy('repeat task', { trustTier: '1', adapter, mode: 'audit' });
    const second = await deriveWithTelemetry('repeat task', {
      trustTier: '1',
      adapter,
      mode: 'audit',
    });
    expect(second.telemetry.trustDecision).toBe('cache-hit');
  });
});
