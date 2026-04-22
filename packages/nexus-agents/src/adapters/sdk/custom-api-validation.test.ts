import { describe, it, expect, afterEach } from 'vitest';
import { validateCustomApiBaseUrl } from './custom-api-validation.js';
import { CUSTOM_API_ALLOW_PRIVATE_ENV } from './types.js';

// Restore the original env var on every teardown so tests that flip
// NEXUS_CUSTOM_API_ALLOW_PRIVATE don't leak into siblings.
describe('validateCustomApiBaseUrl', () => {
  const originalEnv = process.env[CUSTOM_API_ALLOW_PRIVATE_ENV];

  afterEach(() => {
    if (originalEnv === undefined) {
      process.env['NEXUS_CUSTOM_API_ALLOW_PRIVATE'] = '';
      // Full removal: reassign to match initial (undefined) shape
      Reflect.deleteProperty(process.env, 'NEXUS_CUSTOM_API_ALLOW_PRIVATE');
    } else {
      process.env[CUSTOM_API_ALLOW_PRIVATE_ENV] = originalEnv;
    }
  });

  describe('happy path', () => {
    it('accepts a public https URL', () => {
      const result = validateCustomApiBaseUrl('https://gateway.example.com/v1');
      expect(result.ok).toBe(true);
    });

    it('accepts a public http URL (http is allowed; not every gateway has TLS)', () => {
      const result = validateCustomApiBaseUrl('http://gateway.example.com/v1');
      expect(result.ok).toBe(true);
    });

    it('accepts a URL with port and path', () => {
      const result = validateCustomApiBaseUrl('https://gateway.example.com:8443/openai/v1');
      expect(result.ok).toBe(true);
    });

    it('returns the parsed URL object on success', () => {
      const result = validateCustomApiBaseUrl('https://gateway.example.com/v1');
      if (!result.ok) throw new Error('expected ok');
      expect(result.value).toBeInstanceOf(URL);
      expect(result.value.host).toBe('gateway.example.com');
      expect(result.value.pathname).toBe('/v1');
    });
  });

  describe('rejects malformed input', () => {
    it('rejects undefined', () => {
      const result = validateCustomApiBaseUrl(undefined);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/required but missing/i);
    });

    it('rejects empty string', () => {
      const result = validateCustomApiBaseUrl('');
      expect(result.ok).toBe(false);
    });

    it('rejects whitespace-only string', () => {
      const result = validateCustomApiBaseUrl('   ');
      expect(result.ok).toBe(false);
    });

    it('rejects non-URL text', () => {
      const result = validateCustomApiBaseUrl('not a url at all');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/not a valid URL/i);
    });

    it('rejects non-http(s) protocols (file://)', () => {
      const result = validateCustomApiBaseUrl('file:///etc/passwd');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/http or https/i);
    });

    it('rejects ftp://', () => {
      const result = validateCustomApiBaseUrl('ftp://example.com/');
      expect(result.ok).toBe(false);
    });
  });

  describe('SSRF guard (default: deny private/loopback)', () => {
    it('rejects localhost', () => {
      const result = validateCustomApiBaseUrl('http://localhost:8080/v1');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/loopback/);
    });

    it('rejects 127.0.0.1', () => {
      const result = validateCustomApiBaseUrl('http://127.0.0.1/');
      expect(result.ok).toBe(false);
    });

    it('rejects 127.55.1.2 (any 127/8)', () => {
      const result = validateCustomApiBaseUrl('http://127.55.1.2/');
      expect(result.ok).toBe(false);
    });

    it('rejects 10.0.0.5 (RFC 1918)', () => {
      const result = validateCustomApiBaseUrl('http://10.0.0.5/');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/private/i);
    });

    it('rejects 172.16.0.1 through 172.31.255.255', () => {
      expect(validateCustomApiBaseUrl('http://172.16.0.1/').ok).toBe(false);
      expect(validateCustomApiBaseUrl('http://172.31.255.1/').ok).toBe(false);
      // But 172.15 is public, 172.32 is public
      expect(validateCustomApiBaseUrl('http://172.15.0.1/').ok).toBe(true);
      expect(validateCustomApiBaseUrl('http://172.32.0.1/').ok).toBe(true);
    });

    it('rejects 192.168.x.x', () => {
      const result = validateCustomApiBaseUrl('http://192.168.1.1/');
      expect(result.ok).toBe(false);
    });

    it('rejects 169.254.169.254 (AWS IMDS endpoint — high-impact SSRF target)', () => {
      const result = validateCustomApiBaseUrl('http://169.254.169.254/latest/meta-data/');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/link.?local/i);
    });

    it('rejects 0.0.0.0', () => {
      const result = validateCustomApiBaseUrl('http://0.0.0.0/');
      expect(result.ok).toBe(false);
    });

    it('rejects IPv6 loopback ::1', () => {
      const result = validateCustomApiBaseUrl('http://[::1]/');
      expect(result.ok).toBe(false);
    });

    it('rejects IPv6 link-local fe80:: prefix', () => {
      const result = validateCustomApiBaseUrl('http://[fe80::1]/');
      expect(result.ok).toBe(false);
    });

    it('rejects IPv6 unique-local fc00::/7', () => {
      expect(validateCustomApiBaseUrl('http://[fc00::1]/').ok).toBe(false);
      expect(validateCustomApiBaseUrl('http://[fd12:3456:789a::1]/').ok).toBe(false);
    });

    it('rejects .localhost and .local hostnames', () => {
      expect(validateCustomApiBaseUrl('http://gateway.localhost/').ok).toBe(false);
      expect(validateCustomApiBaseUrl('http://gateway.local/').ok).toBe(false);
    });
  });

  describe('SSRF guard escape hatch (NEXUS_CUSTOM_API_ALLOW_PRIVATE)', () => {
    it('allows localhost when allowPrivate=true is passed explicitly', () => {
      const result = validateCustomApiBaseUrl('http://localhost:8080/v1', {
        allowPrivate: true,
      });
      expect(result.ok).toBe(true);
    });

    it('allows 10.0.0.5 when NEXUS_CUSTOM_API_ALLOW_PRIVATE=1 is set', () => {
      process.env[CUSTOM_API_ALLOW_PRIVATE_ENV] = '1';
      const result = validateCustomApiBaseUrl('http://10.0.0.5/');
      expect(result.ok).toBe(true);
    });

    it('allows 127.0.0.1 when NEXUS_CUSTOM_API_ALLOW_PRIVATE=true is set', () => {
      process.env[CUSTOM_API_ALLOW_PRIVATE_ENV] = 'true';
      const result = validateCustomApiBaseUrl('http://127.0.0.1/');
      expect(result.ok).toBe(true);
    });

    it('still rejects when NEXUS_CUSTOM_API_ALLOW_PRIVATE is anything else (e.g. "yes")', () => {
      process.env[CUSTOM_API_ALLOW_PRIVATE_ENV] = 'yes';
      const result = validateCustomApiBaseUrl('http://localhost/');
      expect(result.ok).toBe(false);
    });
  });
});
