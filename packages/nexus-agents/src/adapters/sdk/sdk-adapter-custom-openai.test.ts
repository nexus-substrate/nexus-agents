/**
 * Construction-time tests for the SdkAdapter's custom-openai provider path
 * (#2120). The constructor validates the base URL immediately; these tests
 * confirm the validation short-circuits before any network/dependency load.
 *
 * Runtime tests (actual SDK calls against a mocked @ai-sdk/openai) are out
 * of scope here — they'd require mocking the dynamic import and the AI SDK
 * loader. The `custom-api-validation.test.ts` tests already cover the SSRF
 * classifier in detail; these tests cover the integration with
 * SdkAdapterConfig + env-var fallback.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { SdkAdapter } from './sdk-adapter.js';
import { ConfigError } from '../../core/index.js';
import { CUSTOM_API_BASE_URL_ENV, CUSTOM_API_ALLOW_PRIVATE_ENV } from './types.js';

describe('SdkAdapter custom-openai provider (#2120)', () => {
  const origBaseUrl = process.env[CUSTOM_API_BASE_URL_ENV];
  const origAllowPrivate = process.env[CUSTOM_API_ALLOW_PRIVATE_ENV];

  afterEach(() => {
    restore(CUSTOM_API_BASE_URL_ENV, origBaseUrl);
    restore(CUSTOM_API_ALLOW_PRIVATE_ENV, origAllowPrivate);
  });

  describe('construction-time base URL resolution', () => {
    it('accepts a public https base URL in config', () => {
      expect(
        () =>
          new SdkAdapter({
            providerId: 'custom-openai',
            modelId: 'gpt-4o',
            apiKey: 'test-key',
            baseUrl: 'https://gateway.example.com/v1',
          })
      ).not.toThrow();
    });

    it('falls back to NEXUS_CUSTOM_API_BASE_URL env var when config omits baseUrl', () => {
      process.env[CUSTOM_API_BASE_URL_ENV] = 'https://gateway.example.com/v1';
      expect(
        () =>
          new SdkAdapter({
            providerId: 'custom-openai',
            modelId: 'gpt-4o',
            apiKey: 'test-key',
          })
      ).not.toThrow();
    });

    it('throws ConfigError when no base URL is provided anywhere', () => {
      Reflect.deleteProperty(process.env, CUSTOM_API_BASE_URL_ENV);
      expect(
        () =>
          new SdkAdapter({
            providerId: 'custom-openai',
            modelId: 'gpt-4o',
            apiKey: 'test-key',
          })
      ).toThrow(ConfigError);
    });
  });

  describe('SSRF guard applied at construction', () => {
    it('throws ConfigError for http://localhost', () => {
      expect(
        () =>
          new SdkAdapter({
            providerId: 'custom-openai',
            modelId: 'gpt-4o',
            apiKey: 'test-key',
            baseUrl: 'http://localhost:8080/v1',
          })
      ).toThrow(/SSRF guard/);
    });

    it('throws ConfigError for 169.254.169.254 (AWS IMDS)', () => {
      expect(
        () =>
          new SdkAdapter({
            providerId: 'custom-openai',
            modelId: 'gpt-4o',
            apiKey: 'test-key',
            baseUrl: 'http://169.254.169.254/',
          })
      ).toThrow(/link_local/);
    });

    it('allows private addresses when NEXUS_CUSTOM_API_ALLOW_PRIVATE=1', () => {
      process.env[CUSTOM_API_ALLOW_PRIVATE_ENV] = '1';
      expect(
        () =>
          new SdkAdapter({
            providerId: 'custom-openai',
            modelId: 'gpt-4o',
            apiKey: 'test-key',
            baseUrl: 'http://10.0.0.5/v1',
          })
      ).not.toThrow();
    });

    it('rejects non-http(s) protocols', () => {
      expect(
        () =>
          new SdkAdapter({
            providerId: 'custom-openai',
            modelId: 'gpt-4o',
            apiKey: 'test-key',
            baseUrl: 'file:///etc/passwd',
          })
      ).toThrow(/http or https/);
    });
  });

  describe('does not affect other providers', () => {
    it('openai provider ignores baseUrl param (not a custom gateway)', () => {
      // If someone accidentally passes baseUrl to the built-in 'openai'
      // provider, the guard should NOT fire — that's out of scope for
      // this feature.
      expect(
        () =>
          new SdkAdapter({
            providerId: 'openai',
            modelId: 'gpt-4o',
            apiKey: 'test-key',
            baseUrl: 'http://localhost/v1',
          })
      ).not.toThrow();
    });

    it('anthropic provider unaffected', () => {
      expect(
        () =>
          new SdkAdapter({
            providerId: 'anthropic',
            modelId: 'claude-3-5-sonnet-20241022',
            apiKey: 'test-key',
          })
      ).not.toThrow();
    });
  });
});

function restore(key: string, original: string | undefined): void {
  if (original === undefined) {
    Reflect.deleteProperty(process.env, key);
  } else {
    process.env[key] = original;
  }
}
