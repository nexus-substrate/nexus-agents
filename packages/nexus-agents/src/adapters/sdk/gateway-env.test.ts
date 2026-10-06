/** Tests for canonical gateway env names and removed aliases (#6291 B1). */

import { describe, expect, it } from 'vitest';
import {
  hostnameOf,
  readDirectOpenAiSurface,
  readGatewayEnv,
  resolveGatewayEnv,
} from './gateway-env.js';

const GATEWAY_URL = 'https://gateway.example/v1';
const GATEWAY_KEY = 'sk-TESTFAKE-gateway-key-NOT-REAL-0000';
const OLD_URL = 'https://old.gateway.example/v1';
const OLD_KEY = 'sk-TESTFAKE-old-key-NOT-REAL-0000';

for (const reader of [resolveGatewayEnv, readGatewayEnv]) {
  describe(`${reader.name} (#6291 B1)`, () => {
    it('reads the canonical pair', () => {
      expect(
        reader({ NEXUS_OPENAI_COMPAT_URL: GATEWAY_URL, NEXUS_OPENAI_COMPAT_KEY: GATEWAY_KEY })
      ).toEqual({ baseUrl: GATEWAY_URL, apiKey: GATEWAY_KEY });
    });

    it('ignores the removed aliases when only old names are set', () => {
      const resolved = reader({
        NEXUS_CUSTOM_API_BASE_URL: OLD_URL,
        NEXUS_CUSTOM_API_KEY: OLD_KEY,
      });
      expect(resolved.baseUrl).toBeUndefined();
      expect(resolved.apiKey).toBeUndefined();
    });

    it('keeps canonical values when removed aliases are also set', () => {
      expect(
        reader({
          NEXUS_OPENAI_COMPAT_URL: GATEWAY_URL,
          NEXUS_OPENAI_COMPAT_KEY: GATEWAY_KEY,
          NEXUS_CUSTOM_API_BASE_URL: OLD_URL,
          NEXUS_CUSTOM_API_KEY: OLD_KEY,
        })
      ).toEqual({ baseUrl: GATEWAY_URL, apiKey: GATEWAY_KEY });
    });

    it.each(['', '   '])(
      'does not fall back to removed aliases for blank canonical values (%j)',
      (blank) => {
        const resolved = reader({
          NEXUS_OPENAI_COMPAT_URL: blank,
          NEXUS_OPENAI_COMPAT_KEY: blank,
          NEXUS_CUSTOM_API_BASE_URL: OLD_URL,
          NEXUS_CUSTOM_API_KEY: OLD_KEY,
        });
        expect(resolved.baseUrl).toBeUndefined();
        expect(resolved.apiKey).toBeUndefined();
      }
    );

    it('reads each canonical variable independently', () => {
      expect(
        reader({ NEXUS_OPENAI_COMPAT_URL: GATEWAY_URL, NEXUS_CUSTOM_API_KEY: OLD_KEY })
      ).toEqual({ baseUrl: GATEWAY_URL, apiKey: undefined });
      expect(
        reader({ NEXUS_CUSTOM_API_BASE_URL: OLD_URL, NEXUS_OPENAI_COMPAT_KEY: GATEWAY_KEY })
      ).toEqual({ baseUrl: undefined, apiKey: GATEWAY_KEY });
    });

    it('trims canonical values', () => {
      expect(
        reader({
          NEXUS_OPENAI_COMPAT_URL: `  ${GATEWAY_URL}  `,
          NEXUS_OPENAI_COMPAT_KEY: ` ${GATEWAY_KEY}\n`,
        })
      ).toEqual({ baseUrl: GATEWAY_URL, apiKey: GATEWAY_KEY });
    });

    it('reports an unset pair when neither canonical name is set', () => {
      expect(reader({})).toEqual({ baseUrl: undefined, apiKey: undefined });
    });
  });
}

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
