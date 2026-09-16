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

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { SdkAdapter } from './sdk-adapter.js';
import { ConfigError } from '../../core/index.js';
import {
  CUSTOM_API_ALLOW_PRIVATE_ENV,
  OPENAI_COMPAT_KEY_ENV,
  OPENAI_COMPAT_URL_ENV,
} from './types.js';

// The deprecated spellings (#4392 inc 3), spelled out: the `@deprecated`
// constants must not be read, and the test is about these exact names.
const CUSTOM_API_BASE_URL_ENV = 'NEXUS_CUSTOM_API_BASE_URL';
const CUSTOM_API_KEY_ENV = 'NEXUS_CUSTOM_API_KEY';

describe('SdkAdapter custom-openai provider (#2120)', () => {
  const origBaseUrl = process.env[CUSTOM_API_BASE_URL_ENV];
  const origAllowPrivate = process.env[CUSTOM_API_ALLOW_PRIVATE_ENV];
  const origNewUrl = process.env[OPENAI_COMPAT_URL_ENV];
  const origNewKey = process.env[OPENAI_COMPAT_KEY_ENV];
  const origOldKey = process.env[CUSTOM_API_KEY_ENV];

  beforeEach(() => {
    // #4392 inc 3: the base URL resolves `new ?? old`, so a host env carrying
    // the new name would satisfy "no base URL anywhere" below.
    Reflect.deleteProperty(process.env, OPENAI_COMPAT_URL_ENV);
    Reflect.deleteProperty(process.env, OPENAI_COMPAT_KEY_ENV);
    Reflect.deleteProperty(process.env, CUSTOM_API_KEY_ENV);
  });

  afterEach(() => {
    restore(CUSTOM_API_BASE_URL_ENV, origBaseUrl);
    restore(CUSTOM_API_ALLOW_PRIVATE_ENV, origAllowPrivate);
    restore(OPENAI_COMPAT_URL_ENV, origNewUrl);
    restore(OPENAI_COMPAT_KEY_ENV, origNewKey);
    restore(CUSTOM_API_KEY_ENV, origOldKey);
  });

  describe('env aliases (#4392 inc 3)', () => {
    it('constructs from the NEW names alone (URL and key both from env)', () => {
      process.env[OPENAI_COMPAT_URL_ENV] = 'https://gateway.example.com/v1';
      process.env[OPENAI_COMPAT_KEY_ENV] = 'sk-TESTFAKE-new-NOT-REAL-0000';
      Reflect.deleteProperty(process.env, CUSTOM_API_BASE_URL_ENV);
      expect(
        () => new SdkAdapter({ providerId: 'custom-openai', modelId: 'gpt-5.5' })
      ).not.toThrow();
    });

    it('prefers the NEW base URL over the deprecated one when both are set', () => {
      // The old spelling points at a rejected (loopback) host; if it were
      // honoured over the new one, construction would throw.
      process.env[OPENAI_COMPAT_URL_ENV] = 'https://gateway.example.com/v1';
      process.env[CUSTOM_API_BASE_URL_ENV] = 'http://localhost:4000/v1';
      expect(
        () =>
          new SdkAdapter({ providerId: 'custom-openai', modelId: 'gpt-5.5', apiKey: 'test-key' })
      ).not.toThrow();
    });
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

  describe('rejection messages carry no userinfo (#4392 inc 3 review)', () => {
    it.each(['u:ZQ9pw@gw.example/v1', 'ftp://u:ZQ9pw@gw.example/v1'])(
      'throws for %j without the credential in the message',
      (raw) => {
        process.env[CUSTOM_API_BASE_URL_ENV] = raw;
        let thrown: unknown;
        try {
          new SdkAdapter({ providerId: 'custom-openai', modelId: 'gpt-5.5', apiKey: 'test-key' });
        } catch (e: unknown) {
          thrown = e;
        }
        expect(thrown).toBeInstanceOf(ConfigError);
        expect((thrown as Error).message).not.toContain('ZQ9pw');
      }
    );
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
