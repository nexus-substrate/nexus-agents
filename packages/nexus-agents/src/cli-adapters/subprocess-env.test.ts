/**
 * Tests for the subprocess env-var allowlist (#2865).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildChildEnv,
  getCliVendorKeys,
  readSubprocessDepth,
  NEXUS_SUBPROCESS_DEPTH_ENV,
  NEXUS_SUBPROCESS_EXTRA_ENV,
} from './subprocess-env.js';

describe('buildChildEnv (#2865)', () => {
  /** Env keys the tests touch — cleared before each test for a known slate. */
  const MANAGED = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GOOGLE_AI_API_KEY',
    'GEMINI_API_KEY',
    'OPENROUTER_API_KEY',
    'AWS_SECRET_ACCESS_KEY',
    'GITHUB_TOKEN',
    'CLAUDECODE',
    'LC_CUSTOMTEST',
    'NEXUS_CUSTOMTEST',
    'NEXUS_SUBPROCESS_ENV_ALLOWLIST',
    'NEXUS_SUBPROCESS_DEPTH',
    'NEXUS_SUBPROCESS_EXTRA_ENV',
    'MY_GATEWAY_KEY',
    'npm_config_registry',
    'SOME_RANDOM_UNLISTED_VAR',
  ];

  beforeEach(() => {
    // vi.stubEnv with a function call is lint-clean (no dynamic `delete`);
    // undefined removes the var. CI may have real API keys set, so clear
    // every managed key for a deterministic slate.
    for (const k of MANAGED) vi.stubEnv(k, undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('passes the base infra vars through (PATH, HOME)', () => {
    vi.stubEnv('PATH', '/usr/bin');
    vi.stubEnv('HOME', '/home/test');
    const env = buildChildEnv('gemini');
    expect(env['PATH']).toBe('/usr/bin');
    expect(env['HOME']).toBe('/home/test');
  });

  it('gives gemini only Google keys — strips Anthropic + OpenAI', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-secret');
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-secret');
    vi.stubEnv('GOOGLE_AI_API_KEY', 'goog-key');
    const env = buildChildEnv('gemini');
    expect(env['GOOGLE_AI_API_KEY']).toBe('goog-key');
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(env['OPENAI_API_KEY']).toBeUndefined();
  });

  it('gives codex only the OpenAI key — strips Anthropic + Google', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-secret');
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-secret');
    vi.stubEnv('GOOGLE_AI_API_KEY', 'goog-key');
    const env = buildChildEnv('codex');
    expect(env['OPENAI_API_KEY']).toBe('sk-openai-secret');
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(env['GOOGLE_AI_API_KEY']).toBeUndefined();
  });

  it('gives the claude CLI its own Anthropic key (it is subprocess-spawned)', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-secret');
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-secret');
    const env = buildChildEnv('claude');
    expect(env['ANTHROPIC_API_KEY']).toBe('sk-ant-secret');
    expect(env['OPENAI_API_KEY']).toBeUndefined();
  });

  it('gives opencode every vendor key (it routes to any provider)', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'a');
    vi.stubEnv('OPENAI_API_KEY', 'o');
    vi.stubEnv('GOOGLE_AI_API_KEY', 'g');
    vi.stubEnv('OPENROUTER_API_KEY', 'r');
    const env = buildChildEnv('opencode');
    expect(env['ANTHROPIC_API_KEY']).toBe('a');
    expect(env['OPENAI_API_KEY']).toBe('o');
    expect(env['GOOGLE_AI_API_KEY']).toBe('g');
    expect(env['OPENROUTER_API_KEY']).toBe('r');
  });

  it('drops unrelated secrets that no CLI needs (AWS, GitHub token)', () => {
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'aws-secret');
    vi.stubEnv('GITHUB_TOKEN', 'ghp_secret');
    vi.stubEnv('SOME_RANDOM_UNLISTED_VAR', 'x');
    const env = buildChildEnv('gemini');
    expect(env['AWS_SECRET_ACCESS_KEY']).toBeUndefined();
    expect(env['GITHUB_TOKEN']).toBeUndefined();
    expect(env['SOME_RANDOM_UNLISTED_VAR']).toBeUndefined();
  });

  it('never forwards CLAUDECODE (would break nested CLI sessions)', () => {
    vi.stubEnv('CLAUDECODE', '1');
    expect(buildChildEnv('codex')['CLAUDECODE']).toBeUndefined();
  });

  it('passes prefix-matched families: LC_*, NEXUS_*, npm_config_*', () => {
    vi.stubEnv('LC_CUSTOMTEST', 'en_US.UTF-8');
    vi.stubEnv('NEXUS_CUSTOMTEST', 'cfg');
    vi.stubEnv('npm_config_registry', 'https://registry.example');
    const env = buildChildEnv('codex');
    expect(env['LC_CUSTOMTEST']).toBe('en_US.UTF-8');
    expect(env['NEXUS_CUSTOMTEST']).toBe('cfg');
    expect(env['npm_config_registry']).toBe('https://registry.example');
  });

  it('escape hatch: NEXUS_SUBPROCESS_ENV_ALLOWLIST=0 restores full passthrough (minus CLAUDECODE)', () => {
    vi.stubEnv('NEXUS_SUBPROCESS_ENV_ALLOWLIST', '0');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'aws');
    vi.stubEnv('CLAUDECODE', '1');
    const env = buildChildEnv('gemini');
    // Full passthrough — cross-vendor key NOT stripped.
    expect(env['ANTHROPIC_API_KEY']).toBe('sk-ant');
    expect(env['AWS_SECRET_ACCESS_KEY']).toBe('aws');
    // CLAUDECODE still stripped even under the escape hatch.
    expect(env['CLAUDECODE']).toBeUndefined();
  });

  it('vendor-key map covers every CliName with non-empty keys', () => {
    const map = getCliVendorKeys();
    for (const cli of ['claude', 'gemini', 'codex', 'opencode'] as const) {
      expect(map[cli].length).toBeGreaterThan(0);
    }
  });

  // #4037 — granular extra-env allowlist (avoids the =0 hammer for custom gateways).
  describe('NEXUS_SUBPROCESS_EXTRA_ENV (#4037)', () => {
    it('forwards an operator-named extra var that is neither vendor nor NEXUS_-prefixed', () => {
      vi.stubEnv('MY_GATEWAY_KEY', 'gw-secret');
      // Without the extension, MY_GATEWAY_KEY is stripped (not a vendor/base/NEXUS_ key).
      expect(buildChildEnv('opencode')['MY_GATEWAY_KEY']).toBeUndefined();
      vi.stubEnv(NEXUS_SUBPROCESS_EXTRA_ENV, 'MY_GATEWAY_KEY');
      expect(buildChildEnv('opencode')['MY_GATEWAY_KEY']).toBe('gw-secret');
    });

    it('still strips OTHER non-allowlisted secrets (isolation preserved, not the =0 hammer)', () => {
      vi.stubEnv('MY_GATEWAY_KEY', 'gw-secret');
      vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'aws');
      vi.stubEnv(NEXUS_SUBPROCESS_EXTRA_ENV, 'MY_GATEWAY_KEY');
      const env = buildChildEnv('opencode');
      expect(env['MY_GATEWAY_KEY']).toBe('gw-secret');
      expect(env['AWS_SECRET_ACCESS_KEY']).toBeUndefined();
    });

    it('parses a comma/space-separated list', () => {
      vi.stubEnv('MY_GATEWAY_KEY', 'gw');
      vi.stubEnv(NEXUS_SUBPROCESS_EXTRA_ENV, 'FOO, MY_GATEWAY_KEY  BAR');
      expect(buildChildEnv('codex')['MY_GATEWAY_KEY']).toBe('gw');
    });
  });

  // #4033 — nested-server deadlock guard.
  describe('NEXUS_SUBPROCESS_DEPTH marker (#4033)', () => {
    it('stamps depth=1 on a child spawned from a top-level (unmarked) parent', () => {
      const env = buildChildEnv('opencode');
      expect(env[NEXUS_SUBPROCESS_DEPTH_ENV]).toBe('1');
    });

    it('increments the inherited depth (2 when the parent was already at 1)', () => {
      vi.stubEnv('NEXUS_SUBPROCESS_DEPTH', '1');
      expect(buildChildEnv('opencode')[NEXUS_SUBPROCESS_DEPTH_ENV]).toBe('2');
    });

    it('stamps the depth even under the allowlist=0 escape hatch (overrides inherited)', () => {
      vi.stubEnv('NEXUS_SUBPROCESS_ENV_ALLOWLIST', '0');
      vi.stubEnv('NEXUS_SUBPROCESS_DEPTH', '2');
      // Full passthrough would copy '2'; we must still INCREMENT to 3.
      expect(buildChildEnv('opencode')[NEXUS_SUBPROCESS_DEPTH_ENV]).toBe('3');
    });

    it('round-trips: a child env reads back as nested (depth > 0)', () => {
      const child = buildChildEnv('opencode');
      expect(readSubprocessDepth(child)).toBe(1);
      expect(readSubprocessDepth(child) > 0).toBe(true);
    });

    it('readSubprocessDepth clamps missing/junk/negative to 0 (top-level)', () => {
      expect(readSubprocessDepth({})).toBe(0);
      expect(readSubprocessDepth({ NEXUS_SUBPROCESS_DEPTH: 'abc' })).toBe(0);
      expect(readSubprocessDepth({ NEXUS_SUBPROCESS_DEPTH: '-1' })).toBe(0);
      expect(readSubprocessDepth({ NEXUS_SUBPROCESS_DEPTH: '0' })).toBe(0);
      expect(readSubprocessDepth({ NEXUS_SUBPROCESS_DEPTH: '3' })).toBe(3);
    });
  });
});
