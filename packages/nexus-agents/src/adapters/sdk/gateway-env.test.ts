/**
 * Tests for the mechanism-A gateway env resolver (#4392 increment 3).
 *
 * `NEXUS_CUSTOM_API_BASE_URL` / `NEXUS_CUSTOM_API_KEY` are deprecated aliases
 * of `NEXUS_OPENAI_COMPAT_URL` / `NEXUS_OPENAI_COMPAT_KEY` for the single-model
 * `custom-openai` reader ONLY (panel vote-1789558437481-yup142p runoff,
 * option C). Resolution is `new ?? old` per variable, trimmed, empty = unset,
 * and the deprecation warn fires once per process, naming names — never a
 * value.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ILogger } from '../../core/index.js';
import {
  _resetDeprecatedGatewayEnvWarning,
  hostnameOf,
  readDirectOpenAiSurface,
  readGatewayEnv,
  resolveGatewayEnv,
  warnDeprecatedGatewayEnvOnce,
} from './gateway-env.js';

const NEW_URL = 'https://new.gateway.example/v1';
const NEW_KEY = 'sk-TESTFAKE-new-key-NOT-REAL-0000';
const OLD_URL = 'https://old.gateway.example/v1';
const OLD_KEY = 'sk-TESTFAKE-old-key-NOT-REAL-0000';

type MockLogger = ILogger & Record<'debug' | 'info' | 'warn' | 'error', ReturnType<typeof vi.fn>>;

function makeLogger(): MockLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as MockLogger;
}

function allCalls(logger: MockLogger): string {
  return JSON.stringify([
    ...logger.debug.mock.calls,
    ...logger.info.mock.calls,
    ...logger.warn.mock.calls,
    ...logger.error.mock.calls,
  ]);
}

describe('resolveGatewayEnv (#4392 inc 3)', () => {
  it('reads the new pair when only the new names are set', () => {
    const env = { NEXUS_OPENAI_COMPAT_URL: NEW_URL, NEXUS_OPENAI_COMPAT_KEY: NEW_KEY };
    const resolved = resolveGatewayEnv(env);
    expect(resolved.baseUrl).toBe(NEW_URL);
    expect(resolved.apiKey).toBe(NEW_KEY);
    expect(resolved.deprecated).toEqual([]);
  });

  it('reads the old pair when only the deprecated names are set, reporting both as honoured', () => {
    const env = { NEXUS_CUSTOM_API_BASE_URL: OLD_URL, NEXUS_CUSTOM_API_KEY: OLD_KEY };
    const resolved = resolveGatewayEnv(env);
    expect(resolved.baseUrl).toBe(OLD_URL);
    expect(resolved.apiKey).toBe(OLD_KEY);
    expect(resolved.deprecated).toEqual([
      {
        name: 'NEXUS_CUSTOM_API_BASE_URL',
        replacement: 'NEXUS_OPENAI_COMPAT_URL',
        shadowed: false,
      },
      { name: 'NEXUS_CUSTOM_API_KEY', replacement: 'NEXUS_OPENAI_COMPAT_KEY', shadowed: false },
    ]);
  });

  it('prefers the new name when both spellings are set, reporting the old as shadowed', () => {
    const env = {
      NEXUS_OPENAI_COMPAT_URL: NEW_URL,
      NEXUS_OPENAI_COMPAT_KEY: NEW_KEY,
      NEXUS_CUSTOM_API_BASE_URL: OLD_URL,
      NEXUS_CUSTOM_API_KEY: OLD_KEY,
    };
    const resolved = resolveGatewayEnv(env);
    expect(resolved.baseUrl).toBe(NEW_URL);
    expect(resolved.apiKey).toBe(NEW_KEY);
    expect(resolved.deprecated).toEqual([
      { name: 'NEXUS_CUSTOM_API_BASE_URL', replacement: 'NEXUS_OPENAI_COMPAT_URL', shadowed: true },
      { name: 'NEXUS_CUSTOM_API_KEY', replacement: 'NEXUS_OPENAI_COMPAT_KEY', shadowed: true },
    ]);
  });

  it('resolves each variable independently for a mixed pair (new URL + old key)', () => {
    const env = { NEXUS_OPENAI_COMPAT_URL: NEW_URL, NEXUS_CUSTOM_API_KEY: OLD_KEY };
    const resolved = resolveGatewayEnv(env);
    expect(resolved.baseUrl).toBe(NEW_URL);
    expect(resolved.apiKey).toBe(OLD_KEY);
    expect(resolved.deprecated).toEqual([
      { name: 'NEXUS_CUSTOM_API_KEY', replacement: 'NEXUS_OPENAI_COMPAT_KEY', shadowed: false },
    ]);
  });

  it('resolves each variable independently for the other mixed pair (old URL + new key)', () => {
    const env = { NEXUS_CUSTOM_API_BASE_URL: OLD_URL, NEXUS_OPENAI_COMPAT_KEY: NEW_KEY };
    const resolved = resolveGatewayEnv(env);
    expect(resolved.baseUrl).toBe(OLD_URL);
    expect(resolved.apiKey).toBe(NEW_KEY);
    expect(resolved.deprecated).toEqual([
      {
        name: 'NEXUS_CUSTOM_API_BASE_URL',
        replacement: 'NEXUS_OPENAI_COMPAT_URL',
        shadowed: false,
      },
    ]);
  });

  it('treats an empty or whitespace-only value as unset, for either spelling', () => {
    const env = {
      NEXUS_OPENAI_COMPAT_URL: '   ',
      NEXUS_CUSTOM_API_BASE_URL: OLD_URL,
      NEXUS_OPENAI_COMPAT_KEY: NEW_KEY,
      NEXUS_CUSTOM_API_KEY: '',
    };
    const resolved = resolveGatewayEnv(env);
    // An empty new name does not shadow the old one; an empty old name is not "set".
    expect(resolved.baseUrl).toBe(OLD_URL);
    expect(resolved.apiKey).toBe(NEW_KEY);
    expect(resolved.deprecated).toEqual([
      {
        name: 'NEXUS_CUSTOM_API_BASE_URL',
        replacement: 'NEXUS_OPENAI_COMPAT_URL',
        shadowed: false,
      },
    ]);
  });

  it('trims values', () => {
    const env = {
      NEXUS_OPENAI_COMPAT_URL: `  ${NEW_URL}  `,
      NEXUS_CUSTOM_API_KEY: ` ${OLD_KEY}\n`,
    };
    const resolved = resolveGatewayEnv(env);
    expect(resolved.baseUrl).toBe(NEW_URL);
    expect(resolved.apiKey).toBe(OLD_KEY);
  });

  it('reports nothing set when the environment carries none of the four names', () => {
    const resolved = resolveGatewayEnv({});
    expect(resolved).toEqual({ baseUrl: undefined, apiKey: undefined, deprecated: [] });
  });
});

describe('deprecation warn (#4392 inc 3)', () => {
  beforeEach(() => {
    _resetDeprecatedGatewayEnvWarning();
  });

  afterEach(() => {
    _resetDeprecatedGatewayEnvWarning();
  });

  it('warns exactly once per process across repeated reads', () => {
    const logger = makeLogger();
    const env = { NEXUS_CUSTOM_API_BASE_URL: OLD_URL, NEXUS_CUSTOM_API_KEY: OLD_KEY };
    readGatewayEnv(env, logger);
    readGatewayEnv(env, logger);
    readGatewayEnv(env, logger);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('does not warn when only the new names are set', () => {
    const logger = makeLogger();
    readGatewayEnv({ NEXUS_OPENAI_COMPAT_URL: NEW_URL, NEXUS_OPENAI_COMPAT_KEY: NEW_KEY }, logger);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not warn when nothing is set', () => {
    const logger = makeLogger();
    readGatewayEnv({}, logger);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('names the deprecated variable, its replacement, honoured-vs-shadowed and the gateway-path opt-in', () => {
    const logger = makeLogger();
    readGatewayEnv(
      {
        NEXUS_OPENAI_COMPAT_URL: NEW_URL,
        NEXUS_CUSTOM_API_BASE_URL: OLD_URL,
        NEXUS_CUSTOM_API_KEY: OLD_KEY,
      },
      logger
    );
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const line = String(logger.warn.mock.calls[0]?.[0]);
    expect(line).toContain('NEXUS_CUSTOM_API_BASE_URL');
    expect(line).toContain('NEXUS_OPENAI_COMPAT_URL');
    expect(line).toContain('NEXUS_CUSTOM_API_KEY');
    expect(line).toContain('NEXUS_OPENAI_COMPAT_KEY');
    // The shadowed one says so; the honoured one says so.
    expect(line).toMatch(/NEXUS_CUSTOM_API_BASE_URL[^;]*ignored/);
    expect(line).toMatch(/NEXUS_CUSTOM_API_KEY[^;]*honoured/);
    // The rename is what opts into mechanism B (option C).
    expect(line).toContain('NEXUS_OPENAI_COMPAT_*');
    expect(line).toContain('model discovery');
    expect(line).toContain('in-process voter transport');
    expect(line).toContain('api:<endpoint>');
    expect(line).toContain('#6291');
  });

  it('never puts a value on the warn line — not the URL, not the key', () => {
    const logger = makeLogger();
    readGatewayEnv(
      {
        NEXUS_CUSTOM_API_BASE_URL: OLD_URL,
        NEXUS_CUSTOM_API_KEY: OLD_KEY,
        NEXUS_OPENAI_COMPAT_KEY: NEW_KEY,
      },
      logger
    );
    const flat = allCalls(logger);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(flat).not.toContain(OLD_URL);
    expect(flat).not.toContain(OLD_KEY);
    expect(flat).not.toContain(NEW_KEY);
    expect(flat).not.toContain('old.gateway.example');
  });

  it('warnDeprecatedGatewayEnvOnce shares the once-guard with readGatewayEnv', () => {
    const logger = makeLogger();
    const env = { NEXUS_CUSTOM_API_KEY: OLD_KEY };
    warnDeprecatedGatewayEnvOnce(env, logger);
    readGatewayEnv(env, logger);
    warnDeprecatedGatewayEnvOnce(env, logger);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('readGatewayEnv returns the resolved values alongside the deprecation list', () => {
    const logger = makeLogger();
    const env = { NEXUS_CUSTOM_API_BASE_URL: OLD_URL, NEXUS_OPENAI_COMPAT_KEY: NEW_KEY };
    expect(readGatewayEnv(env, logger)).toEqual({
      baseUrl: OLD_URL,
      apiKey: NEW_KEY,
      deprecated: [
        {
          name: 'NEXUS_CUSTOM_API_BASE_URL',
          replacement: 'NEXUS_OPENAI_COMPAT_URL',
          shadowed: false,
        },
      ],
    });
  });
});

describe('hostnameOf (#4392 inc 3 — no-logging parity)', () => {
  it('returns the host only, dropping userinfo, path and port', () => {
    expect(hostnameOf('https://u:pw@gateway.example:8443/v1')).toBe('gateway.example');
  });

  it('returns a placeholder for a scheme-only string with no host (a pasted key@host parses as a scheme)', () => {
    // WHATWG reads `u:` as the scheme, so this PARSES, with an empty hostname
    // — the raw string, or an empty host, must not be what reaches the log.
    expect(hostnameOf('u:ZQ9pw@host/v1')).toBe('<no host>');
  });

  it('returns a placeholder rather than the raw string when the URL does not parse', () => {
    // The raw string is exactly what a pasted `key@host` mistake would leak.
    expect(hostnameOf('not a url')).toBe('<unparseable url>');
  });
});

describe('readDirectOpenAiSurface (#6654)', () => {
  it.each([
    ['unset', {}],
    ['blank', { OPENAI_BASE_URL: '  ' }],
    ['api.openai.com', { OPENAI_BASE_URL: 'https://api.openai.com/v1' }],
    ['api.openai.com in upper case', { OPENAI_BASE_URL: 'https://API.OPENAI.COM/v1' }],
  ])('keeps the provider default when OPENAI_BASE_URL is %s', (_label, env) => {
    // An override that would throw proves the override is not even read.
    expect(readDirectOpenAiSurface({ ...env, NEXUS_CUSTOM_API_SURFACE: 'bogus' })).toBeUndefined();
  });

  it('uses chat completions for any other host, and honours the override', () => {
    const gateway = { OPENAI_BASE_URL: 'https://llm.corp.example/v1' };
    expect(readDirectOpenAiSurface(gateway)).toBe('chat');
    expect(readDirectOpenAiSurface({ ...gateway, NEXUS_CUSTOM_API_SURFACE: 'responses' })).toBe(
      'responses'
    );
    expect(() =>
      readDirectOpenAiSurface({ ...gateway, NEXUS_CUSTOM_API_SURFACE: 'bogus' })
    ).toThrow(/NEXUS_CUSTOM_API_SURFACE/);
  });
});
