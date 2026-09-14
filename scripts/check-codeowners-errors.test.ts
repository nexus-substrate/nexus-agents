/**
 * Tests for the CODEOWNERS-parses-under-GitHub gate (#6174).
 *
 * @module scripts/check-codeowners-errors.test
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  summarizeCodeownersErrors,
  summarizeCodeownersResponse,
  checkCodeownersErrors,
  parseRefArg,
  readCheckInput,
} from './check-codeowners-errors.js';

/** Two entries in the shape GitHub documents for `GET /repos/{o}/{r}/codeowners/errors`. */
const TWO_ERRORS = {
  errors: [
    {
      line: 1,
      column: 1,
      kind: 'Invalid pattern',
      source: '***/*.rb @monalisa',
      suggestion: 'Did you mean **/*.rb?',
      message: 'Invalid pattern on line 1: Did you mean **/*.rb?\n\n  ***/*.rb @monalisa\n  ^',
      path: 'CODEOWNERS',
    },
    {
      line: 20,
      column: 11,
      kind: 'Unknown owner',
      source: 'cloud/* @unknown',
      suggestion: 'Make sure @unknown exists and has write access to the repository',
      message: 'Unknown owner on line 20: ...',
      path: 'CODEOWNERS',
    },
  ],
};

describe('summarizeCodeownersErrors', () => {
  it('fails on two errors and names each by line:column with kind and suggestion', () => {
    const result = summarizeCodeownersErrors(TWO_ERRORS);
    expect(result.ok).toBe(false);
    const joined = result.lines.join('\n');
    expect(joined).toContain('CODEOWNERS:1:1');
    expect(joined).toContain('CODEOWNERS:20:11');
    expect(joined).toContain('Invalid pattern');
    expect(joined).toContain('Unknown owner');
    expect(joined).toContain('Did you mean **/*.rb?');
    expect(joined).toContain('Make sure @unknown exists');
    // One line per error, plus the count line.
    expect(result.lines.filter((l) => l.startsWith('CODEOWNERS:'))).toHaveLength(2);
    expect(joined).toContain('2 error');
  });

  it('passes on an empty errors array — the named, measured empty case', () => {
    const result = summarizeCodeownersErrors({ errors: [] });
    expect(result.ok).toBe(true);
    expect(result.lines.join('\n')).toContain('0 errors');
  });

  it('FAILS when the errors field is absent — an unexpected shape is not a pass', () => {
    const result = summarizeCodeownersErrors({ message: 'Not Found' });
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toMatch(/unexpected payload shape/i);
  });

  it('FAILS when errors is present but not an array', () => {
    const result = summarizeCodeownersErrors({ errors: 'none' });
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toMatch(/unexpected payload shape/i);
  });

  it('FAILS when the payload is not an object at all', () => {
    expect(summarizeCodeownersErrors(null).ok).toBe(false);
    expect(summarizeCodeownersErrors('[]').ok).toBe(false);
    expect(summarizeCodeownersErrors([]).ok).toBe(false);
  });

  it('renders an error entry with missing fields without throwing, and still fails', () => {
    const result = summarizeCodeownersErrors({ errors: [{ kind: 'Invalid pattern' }] });
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('Invalid pattern');
  });
});

describe('summarizeCodeownersResponse', () => {
  it('fails on a 404 whose body is not JSON, naming the status', () => {
    const result = summarizeCodeownersResponse({
      status: 404,
      body: '<html><body>Not Found</body></html>',
    });
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('404');
  });

  it('fails on a 200 whose body is not JSON', () => {
    const result = summarizeCodeownersResponse({ status: 200, body: 'errors: []' });
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toMatch(/not JSON/i);
  });

  it('fails on a non-2xx status even when the body parses', () => {
    const result = summarizeCodeownersResponse({
      status: 403,
      body: JSON.stringify({ errors: [] }),
    });
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('403');
  });

  it('delegates a 200 JSON body to the payload summarizer', () => {
    expect(
      summarizeCodeownersResponse({ status: 200, body: JSON.stringify({ errors: [] }) }).ok
    ).toBe(true);
    expect(summarizeCodeownersResponse({ status: 200, body: JSON.stringify(TWO_ERRORS) }).ok).toBe(
      false
    );
  });
});

describe('checkCodeownersErrors (fetch seam)', () => {
  const baseInput = {
    repository: 'nexus-substrate/nexus-agents',
    ref: 'abc123',
    token: 'test-token',
    apiUrl: 'https://api.example.test',
  };

  it('calls the documented endpoint with the ref and a bearer token', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetchImpl = (
      url: string,
      init: { headers: Record<string, string> }
    ): Promise<Response> => {
      calls.push({ url, headers: init.headers });
      return Promise.resolve(new Response(JSON.stringify({ errors: [] }), { status: 200 }));
    };
    const result = await checkCodeownersErrors(baseInput, fetchImpl);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      'https://api.example.test/repos/nexus-substrate/nexus-agents/codeowners/errors?ref=abc123'
    );
    expect(calls[0]?.headers['Authorization']).toBe('Bearer test-token');
  });

  it('fails on a 404 with a non-JSON body', async () => {
    const fetchImpl = (): Promise<Response> =>
      Promise.resolve(new Response('Not Found', { status: 404 }));
    const result = await checkCodeownersErrors(baseInput, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('404');
  });

  it('fails when fetch itself throws (network down is unmeasured, not clean)', async () => {
    const fetchImpl = (): Promise<Response> => Promise.reject(new Error('ECONNREFUSED'));
    const result = await checkCodeownersErrors(baseInput, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('ECONNREFUSED');
  });

  it('URL-encodes the ref so a hostile ref cannot rewrite the path', async () => {
    let seen = '';
    const fetchImpl = (url: string): Promise<Response> => {
      seen = url;
      return Promise.resolve(new Response(JSON.stringify({ errors: [] }), { status: 200 }));
    };
    await checkCodeownersErrors({ ...baseInput, ref: 'a/b?c=d' }, fetchImpl);
    expect(seen.endsWith('?ref=a%2Fb%3Fc%3Dd')).toBe(true);
  });
});

describe('readCheckInput', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('names every missing piece, not just the first', () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('GITHUB_REPOSITORY', '');
    const read = readCheckInput([]);
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.missing).toEqual(['--ref <sha>', 'GITHUB_TOKEN', 'GITHUB_REPOSITORY']);
  });

  it('defaults the API origin to api.github.com and honours GITHUB_API_URL', () => {
    vi.stubEnv('GITHUB_TOKEN', 't');
    vi.stubEnv('GITHUB_REPOSITORY', 'o/r');
    vi.stubEnv('GITHUB_API_URL', '');
    const dflt = readCheckInput(['--ref', 'abc']);
    expect(dflt.ok).toBe(true);
    if (!dflt.ok) return;
    expect(dflt.input).toEqual({
      repository: 'o/r',
      ref: 'abc',
      token: 't',
      apiUrl: 'https://api.github.com',
    });

    vi.stubEnv('GITHUB_API_URL', 'http://127.0.0.1:1/');
    const stubbed = readCheckInput(['--ref=abc']);
    expect(stubbed.ok && stubbed.input.apiUrl).toBe('http://127.0.0.1:1/');
  });
});

describe('parseRefArg', () => {
  it('reads --ref <sha>', () => {
    expect(parseRefArg(['--ref', 'deadbeef'])).toBe('deadbeef');
  });

  it('reads --ref=<sha>', () => {
    expect(parseRefArg(['--ref=deadbeef'])).toBe('deadbeef');
  });

  it('returns undefined when --ref is missing or empty', () => {
    expect(parseRefArg([])).toBeUndefined();
    expect(parseRefArg(['--ref'])).toBeUndefined();
    expect(parseRefArg(['--ref', ''])).toBeUndefined();
  });
});
