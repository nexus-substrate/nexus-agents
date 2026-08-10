import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CUSTOM_API_DEFAULT_MODEL } from '../config/defaults.js';
import { configureCustomApi, type HttpFetcher } from './setup-custom-api.js';

describe('configureCustomApi (#2124)', () => {
  const originalKey = process.env['NEXUS_CUSTOM_API_KEY'];

  beforeEach(() => {
    Reflect.deleteProperty(process.env, 'NEXUS_CUSTOM_API_KEY');
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env['NEXUS_CUSTOM_API_KEY'] = originalKey;
    } else {
      Reflect.deleteProperty(process.env, 'NEXUS_CUSTOM_API_KEY');
    }
  });

  const okFetcher: HttpFetcher = () => Promise.resolve({ status: 200, body: '{"data":[]}' });
  const unauthorizedFetcher: HttpFetcher = () =>
    Promise.resolve({ status: 401, body: '{"error":"unauthorized"}' });
  const serverErrorFetcher: HttpFetcher = () =>
    Promise.resolve({ status: 500, body: '{"error":"internal"}' });
  const throwsFetcher: HttpFetcher = () => Promise.reject(new Error('ENOTFOUND'));

  const minimalInput = (
    overrides: Partial<Parameters<typeof configureCustomApi>[0]> = {}
  ): Parameters<typeof configureCustomApi>[0] => ({
    baseUrl: 'https://gateway.example.com/v1',
    apiKey: 'test-key',
    nonInteractive: true,
    fetcher: okFetcher,
    ...overrides,
  });

  describe('happy path', () => {
    it('succeeds end-to-end with a valid gateway', async () => {
      const result = await configureCustomApi(minimalInput());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.baseUrl).toBe('https://gateway.example.com/v1');
      expect(result.value.probeSucceeded).toBe(true);
      // #4408: the default moved off gpt-4o, which is end-of-life at OpenAI.
      // Assert against the constant rather than a literal so the next lifecycle
      // move does not need a test edit.
      expect(result.value.model).toBe(CUSTOM_API_DEFAULT_MODEL);
    });

    it('respects a custom model override', async () => {
      const result = await configureCustomApi(minimalInput({ model: 'claude-opus-4-5' }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.model).toBe('claude-opus-4-5');
    });

    it('produces a shell fragment the user can paste into their shell rc', async () => {
      const result = await configureCustomApi(minimalInput());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.shellFragment).toContain('export NEXUS_CUSTOM_API_BASE_URL=');
      expect(result.value.shellFragment).toContain('export NEXUS_CUSTOM_API_KEY=');
      expect(result.value.shellFragment).toContain('export NEXUS_CUSTOM_MODEL=');
      expect(result.value.shellFragment).toContain('test-key');
      expect(result.value.shellFragment).toContain('gateway.example.com');
    });

    it('includes NEXUS_CUSTOM_API_ALLOW_PRIVATE export when allowPrivate is set', async () => {
      const result = await configureCustomApi(
        minimalInput({ baseUrl: 'http://10.0.0.5/v1', allowPrivate: true })
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.shellFragment).toContain('NEXUS_CUSTOM_API_ALLOW_PRIVATE=1');
    });
  });

  describe('URL validation (reuses #2125 SSRF guard)', () => {
    it('rejects loopback without allowPrivate', async () => {
      const result = await configureCustomApi(minimalInput({ baseUrl: 'http://localhost/v1' }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/loopback/);
    });

    it('rejects non-http(s) protocols', async () => {
      const result = await configureCustomApi(minimalInput({ baseUrl: 'file:///etc/passwd' }));
      expect(result.ok).toBe(false);
    });

    it('rejects garbage input', async () => {
      const result = await configureCustomApi(minimalInput({ baseUrl: 'not-a-url' }));
      expect(result.ok).toBe(false);
    });
  });

  describe('API key resolution', () => {
    it('uses the provided apiKey when passed explicitly', async () => {
      const result = await configureCustomApi(minimalInput({ apiKey: 'explicit-key' }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.shellFragment).toContain('explicit-key');
    });

    it('falls back to NEXUS_CUSTOM_API_KEY env var', async () => {
      process.env['NEXUS_CUSTOM_API_KEY'] = 'from-env';
      const { apiKey: _apiKey, ...rest } = minimalInput();
      void _apiKey;
      const result = await configureCustomApi(rest);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.shellFragment).toContain('from-env');
    });

    it('fails cleanly in non-interactive mode when no key is available', async () => {
      const { apiKey: _apiKey, ...rest } = minimalInput();
      void _apiKey;
      const result = await configureCustomApi(rest);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/API key required/i);
    });
  });

  describe('probe error handling', () => {
    it('reports unauthorized with actionable guidance', async () => {
      const result = await configureCustomApi(minimalInput({ fetcher: unauthorizedFetcher }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/probe failed/i);
      expect(result.error.message).toMatch(/api key has \/models read scope/i);
    });

    it('reports 5xx with same actionable guidance', async () => {
      const result = await configureCustomApi(minimalInput({ fetcher: serverErrorFetcher }));
      expect(result.ok).toBe(false);
    });

    it('swallows network-layer exceptions into a structured failure', async () => {
      const result = await configureCustomApi(minimalInput({ fetcher: throwsFetcher }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/probe failed/i);
    });

    it('skips the probe entirely when skipProbe is true', async () => {
      const result = await configureCustomApi(
        minimalInput({ skipProbe: true, fetcher: throwsFetcher })
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.probeSucceeded).toBe(false);
    });
  });

  describe('probe URL construction', () => {
    it('appends /models to the base URL (stripping trailing slash)', async () => {
      const probed: string[] = [];
      const recordingFetcher: HttpFetcher = (url) => {
        probed.push(url);
        return Promise.resolve({ status: 200, body: '{}' });
      };
      await configureCustomApi(
        minimalInput({ baseUrl: 'https://gateway.example.com/v1/', fetcher: recordingFetcher })
      );
      expect(probed[0]).toBe('https://gateway.example.com/v1/models');
    });

    it('sends Authorization: Bearer <key>', async () => {
      let capturedAuth = '';
      const recordingFetcher: HttpFetcher = (_, init) => {
        capturedAuth = init.headers['Authorization'] ?? '';
        return Promise.resolve({ status: 200, body: '{}' });
      };
      await configureCustomApi(minimalInput({ apiKey: 'secret-key', fetcher: recordingFetcher }));
      expect(capturedAuth).toBe('Bearer secret-key');
    });
  });
});
