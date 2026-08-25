import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import {
  validateCustomApiBaseUrl,
  assertCustomApiHostResolvesPublic,
} from './custom-api-validation.js';
import { CUSTOM_API_ALLOW_PRIVATE_ENV } from './types.js';

// Mock the DNS promises API so resolve-time tests don't hit a real resolver.
const lookupMock = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', () => ({
  lookup: lookupMock,
}));

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

  describe('IPv4-mapped IPv6 reaches the IPv4 rules', () => {
    // `isIPv6('::ffff:169.254.169.254')` is true and `isIPv4` is false, so
    // these were dispatched to the IPv6 classifier, which only knew `::1`,
    // `fe80:` and `fc00::/7`. Every IPv4 rule — IMDS, loopback, RFC1918 —
    // was unreachable in mapped form.
    //
    // The URL parser NORMALISES the dotted form to hex
    // (`::ffff:169.254.169.254` → `::ffff:a9fe:a9fe`), so a fix matching only
    // the dotted spelling would still miss every real request. Both are
    // asserted for that reason.

    it('rejects the AWS IMDS address in mapped dotted form', () => {
      const result = validateCustomApiBaseUrl('http://[::ffff:169.254.169.254]/latest/meta-data/');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/link-local|169\.254/);
    });

    it('rejects the AWS IMDS address in mapped hex form', () => {
      expect(validateCustomApiBaseUrl('http://[::ffff:a9fe:a9fe]/').ok).toBe(false);
    });

    it('rejects mapped loopback and RFC1918', () => {
      expect(validateCustomApiBaseUrl('http://[::ffff:127.0.0.1]/').ok).toBe(false);
      expect(validateCustomApiBaseUrl('http://[::ffff:10.0.0.1]/').ok).toBe(false);
      expect(validateCustomApiBaseUrl('http://[::ffff:192.168.1.1]/').ok).toBe(false);
      expect(validateCustomApiBaseUrl('http://[::ffff:172.16.0.1]/').ok).toBe(false);
    });

    it('rejects the NAT64 well-known prefix carrying a private IPv4', () => {
      // 64:ff9b::/96 is how an IPv6-only network reaches IPv4 — the same
      // address by another spelling.
      expect(validateCustomApiBaseUrl('http://[64:ff9b::169.254.169.254]/').ok).toBe(false);
    });

    it('rejects the unspecified address', () => {
      // `::` routes to localhost on most stacks, the IPv6 analogue of 0.0.0.0.
      expect(validateCustomApiBaseUrl('http://[::]/').ok).toBe(false);
    });

    it('still allows a genuinely public IPv6 address', () => {
      // The pair. Rejecting all IPv6 would satisfy every test above and break
      // every legitimate v6 gateway.
      expect(validateCustomApiBaseUrl('http://[2606:4700:4700::1111]/v1').ok).toBe(true);
    });

    it('still allows a public IPv4 address in mapped form', () => {
      // Mapped is a spelling, not a verdict — it must not become a blanket
      // rejection.
      expect(validateCustomApiBaseUrl('http://[::ffff:1.1.1.1]/v1').ok).toBe(true);
    });
  });

  describe('reserved ranges beyond RFC1918', () => {
    // The first pass listed the four ranges everyone remembers — 10/8,
    // 172.16/12, 192.168/16, 169.254/16 — and stopped. Cloud metadata does
    // not live only at 169.254.169.254, and "not RFC1918" is not the same
    // as "public".

    it('rejects the CGNAT range that carries Alibaba Cloud metadata', () => {
      // 100.64/10 is RFC6598 shared address space: cloud NAT, container
      // fabrics, and 100.100.100.200, which serves instance credentials.
      expect(validateCustomApiBaseUrl('http://100.100.100.200/latest/meta-data/').ok).toBe(false);
    });

    it('rejects CGNAT written as mapped IPv6', () => {
      // The pair for the fix above: the v6 classifier delegates to the v4
      // rules, so a gap in that table is reachable by both spellings.
      expect(validateCustomApiBaseUrl('http://[::ffff:6464:64c8]/').ok).toBe(false);
    });

    it('rejects 192.0.0.0/24, which carries legacy Oracle Cloud metadata', () => {
      expect(validateCustomApiBaseUrl('http://192.0.0.192/').ok).toBe(false);
    });

    it('rejects the 198.18.0.0/15 benchmarking range', () => {
      // Both halves. A /15 spans two second octets, and asserting only 198.18
      // passes against a rule narrowed to it — checked by mutation.
      expect(validateCustomApiBaseUrl('http://198.18.0.1/').ok).toBe(false);
      expect(validateCustomApiBaseUrl('http://198.19.255.254/').ok).toBe(false);
    });

    it('rejects multicast and the reserved 240/4 block', () => {
      expect(validateCustomApiBaseUrl('http://224.0.0.1/').ok).toBe(false);
      expect(validateCustomApiBaseUrl('http://240.0.0.1/').ok).toBe(false);
    });

    it('rejects the limited broadcast address', () => {
      expect(validateCustomApiBaseUrl('http://255.255.255.255/').ok).toBe(false);
    });

    it('keeps the neighbours of each new range allowed', () => {
      // Every rule above is an inequality, and an off-by-one turns a /10 into
      // a /8. These are the addresses immediately outside each block.
      expect(validateCustomApiBaseUrl('http://100.63.255.255/v1').ok).toBe(true);
      expect(validateCustomApiBaseUrl('http://100.128.0.1/v1').ok).toBe(true);
      expect(validateCustomApiBaseUrl('http://192.0.1.1/v1').ok).toBe(true);
      expect(validateCustomApiBaseUrl('http://198.17.255.255/v1').ok).toBe(true);
      expect(validateCustomApiBaseUrl('http://198.20.0.1/v1').ok).toBe(true);
      expect(validateCustomApiBaseUrl('http://223.255.255.255/v1').ok).toBe(true);
    });
  });

  describe('IPv6 link-local and site-local cover their whole prefix', () => {
    it('rejects link-local above fe80:', () => {
      // The check was `startsWith('fe80:')`, but link-local is fe80::/10 —
      // fe80 through febf. Only the first 1/64th of the block was covered.
      expect(validateCustomApiBaseUrl('http://[febf::1]/').ok).toBe(false);
      expect(validateCustomApiBaseUrl('http://[fe90::1]/').ok).toBe(false);
    });

    it('rejects deprecated site-local addresses', () => {
      expect(validateCustomApiBaseUrl('http://[fec0::1]/').ok).toBe(false);
    });

    it('rejects a 6to4 address carrying a private IPv4', () => {
      // 2002::/16 embeds the IPv4 in hextets 1-2, not 6-7, so it was the one
      // IPv4-carrying prefix `embeddedIPv4` did not reach despite the
      // doc-comment claiming it covered every one.
      expect(validateCustomApiBaseUrl('http://[2002:a9fe:a9fe::]/').ok).toBe(false);
      expect(validateCustomApiBaseUrl('http://[2002:7f00:1::]/').ok).toBe(false);
    });

    it('still allows 6to4 wrapping a public IPv4', () => {
      // The pair: 2002::/16 must not become a blanket rejection.
      expect(validateCustomApiBaseUrl('http://[2002:101:101::]/v1').ok).toBe(true);
    });

    it('still allows public IPv6 that merely starts with fe', () => {
      // fe00::/9 below fe80 is not link-local; a prefix test widened to `fe`
      // would swallow it.
      expect(validateCustomApiBaseUrl('http://[fe00::1]/v1').ok).toBe(true);
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

describe('assertCustomApiHostResolvesPublic (DNS-resolve-time SSRF guard, #3426)', () => {
  const originalEnv = process.env[CUSTOM_API_ALLOW_PRIVATE_ENV];

  beforeEach(() => {
    lookupMock.mockReset();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      Reflect.deleteProperty(process.env, 'NEXUS_CUSTOM_API_ALLOW_PRIVATE');
    } else {
      process.env[CUSTOM_API_ALLOW_PRIVATE_ENV] = originalEnv;
    }
  });

  describe('public name resolving to a private IP is rejected', () => {
    it('rejects a public name that resolves to 10.0.0.5 (RFC 1918)', async () => {
      lookupMock.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
      const result = await assertCustomApiHostResolvesPublic('gateway.evil.test');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/private/i);
      expect(result.error.message).toMatch(/gateway\.evil\.test/);
    });

    it('rejects a public name that resolves to 127.0.0.1 (loopback)', async () => {
      lookupMock.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
      const result = await assertCustomApiHostResolvesPublic('localhost-rebind.test');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/loopback/i);
    });

    it('rejects a public name that resolves to 169.254.169.254 (AWS IMDS link-local)', async () => {
      lookupMock.mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
      const result = await assertCustomApiHostResolvesPublic('imds.evil.test');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/link.?local/i);
    });

    it('rejects a public name that resolves to ::1 (IPv6 loopback)', async () => {
      lookupMock.mockResolvedValueOnce([{ address: '::1', family: 6 }]);
      const result = await assertCustomApiHostResolvesPublic('v6-loopback.test');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/loopback/i);
    });

    it('rejects if ANY of multiple resolved addresses is private (fail-closed)', async () => {
      lookupMock.mockResolvedValueOnce([
        { address: '93.184.216.34', family: 4 }, // public
        { address: '192.168.1.1', family: 4 }, // private — must trip the guard
      ]);
      const result = await assertCustomApiHostResolvesPublic('multi.test');
      expect(result.ok).toBe(false);
    });
  });

  describe('public name resolving to a public IP is allowed', () => {
    it('accepts a public name that resolves to a public IP', async () => {
      lookupMock.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
      const result = await assertCustomApiHostResolvesPublic('gateway.example.com');
      expect(result.ok).toBe(true);
      expect(lookupMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('IP literals need no DNS, but are still classified here', () => {
    // This used to return ok for ANY literal, on the stated grounds that the
    // sync guard classified it at construction. `discoverModels` never calls
    // the sync guard — it calls only this one — so on that path each guard
    // deferred to the other and neither ran. A base URL of
    // `http://169.254.169.254/` reached IMDS, and that URL can come from a
    // FILE (opencode.json), not only from operator intent.

    it('does not call dns.lookup for a public IPv4 literal', () => {
      const result = assertCustomApiHostResolvesPublic('93.184.216.34');
      return result.then((r) => {
        expect(r.ok).toBe(true);
        expect(lookupMock).not.toHaveBeenCalled();
      });
    });

    it('does not call dns.lookup for a bracket-stripped IPv6 literal', async () => {
      const result = await assertCustomApiHostResolvesPublic('[2606:2800:220:1::1]');
      expect(result.ok).toBe(true);
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it('rejects a private IPv4 literal instead of deferring', async () => {
      const result = await assertCustomApiHostResolvesPublic('169.254.169.254');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/link-local|169\.254/);
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it('rejects a loopback literal instead of deferring', async () => {
      expect((await assertCustomApiHostResolvesPublic('127.0.0.1')).ok).toBe(false);
    });

    it('rejects an IPv4-mapped IPv6 literal — both halves of the same bypass', async () => {
      // Needs BOTH fixes: the literal must be classified here at all, and the
      // classifier must see through the mapped form.
      expect((await assertCustomApiHostResolvesPublic('[::ffff:a9fe:a9fe]')).ok).toBe(false);
    });

    it('still honours allowPrivate for a private literal', async () => {
      const result = await assertCustomApiHostResolvesPublic('127.0.0.1', { allowPrivate: true });
      expect(result.ok).toBe(true);
    });
  });

  describe('allowPrivate bypass performs no lookup', () => {
    it('bypasses (no lookup) when allowPrivate=true is passed', async () => {
      const result = await assertCustomApiHostResolvesPublic('gateway.evil.test', {
        allowPrivate: true,
      });
      expect(result.ok).toBe(true);
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it('bypasses (no lookup) when NEXUS_CUSTOM_API_ALLOW_PRIVATE=1', async () => {
      process.env[CUSTOM_API_ALLOW_PRIVATE_ENV] = '1';
      const result = await assertCustomApiHostResolvesPublic('gateway.evil.test');
      expect(result.ok).toBe(true);
      expect(lookupMock).not.toHaveBeenCalled();
    });
  });

  describe('fail-open on lookup error (additive defense-in-depth)', () => {
    it('returns ok when dns.lookup throws (does not break legit gateways)', async () => {
      lookupMock.mockRejectedValueOnce(new Error('ENOTFOUND transient'));
      const result = await assertCustomApiHostResolvesPublic('flaky-resolver.example.com');
      expect(result.ok).toBe(true);
      expect(lookupMock).toHaveBeenCalledTimes(1);
    });
  });
});
