import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryOsv, queryOsvBatch, OsvVulnerabilitySchema } from './osv-lookup.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

const MOCK_OSV_RESPONSE = {
  vulns: [
    {
      id: 'GHSA-xxxx-yyyy-zzzz',
      summary: 'Prototype pollution in lodash',
      aliases: ['CVE-2020-8203'],
      database_specific: { severity: 'HIGH' },
      affected: [
        {
          versions: ['4.17.15', '4.17.16', '4.17.17', '4.17.18', '4.17.19', '4.17.20'],
          ranges: [{ events: [{ fixed: '4.17.21' }] }],
        },
      ],
      references: [{ url: 'https://github.com/lodash/lodash/issues/4874' }],
    },
  ],
};

describe('OsvVulnerabilitySchema', () => {
  it('validates a well-formed vulnerability', () => {
    const vuln = OsvVulnerabilitySchema.parse({
      id: 'GHSA-test',
      summary: 'Test vuln',
      severity: 'HIGH',
      aliases: ['CVE-2024-0001'],
      fixedVersion: '1.2.3',
    });
    expect(vuln.id).toBe('GHSA-test');
    expect(vuln.severity).toBe('HIGH');
  });
});

describe('queryOsv', () => {
  it('returns vulnerabilities on successful response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_OSV_RESPONSE),
    });

    const result = await queryOsv('lodash', '4.17.20');

    expect(result.error).toBeNull();
    expect(result.vulnerabilities).toHaveLength(1);
    expect(result.vulnerabilities[0]?.id).toBe('GHSA-xxxx-yyyy-zzzz');
    expect(result.vulnerabilities[0]?.severity).toBe('HIGH');
    expect(result.vulnerabilities[0]?.fixedVersion).toBe('4.17.21');
    expect(result.vulnerabilities[0]?.aliases).toContain('CVE-2020-8203');
    expect(result.packageName).toBe('lodash');
    expect(result.packageVersion).toBe('4.17.20');
  });

  it('returns empty on no vulns', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await queryOsv('safe-package', '1.0.0');

    expect(result.error).toBeNull();
    expect(result.vulnerabilities).toHaveLength(0);
  });

  it('returns error on HTTP failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const result = await queryOsv('lodash', '4.17.20');

    expect(result.error).toBe('HTTP 500');
    expect(result.vulnerabilities).toHaveLength(0);
  });

  it('returns error on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await queryOsv('lodash', '4.17.20');

    expect(result.error).toBe('ECONNREFUSED');
    expect(result.vulnerabilities).toHaveLength(0);
  });

  it('sends correct request body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await queryOsv('express', '4.18.0');

    const call = mockFetch.mock.calls[0];
    expect(call?.[0]).toBe('https://api.osv.dev/v1/query');
    const body = JSON.parse(call?.[1]?.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      version: '4.18.0',
      package: { name: 'express', ecosystem: 'npm' },
    });
  });
});

describe('queryOsvBatch', () => {
  it('queries multiple packages', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_OSV_RESPONSE),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

    const results = await queryOsvBatch([
      { name: 'lodash', version: '4.17.20' },
      { name: 'safe-pkg', version: '1.0.0' },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]?.vulnerabilities).toHaveLength(1);
    expect(results[1]?.vulnerabilities).toHaveLength(0);
  });
});
