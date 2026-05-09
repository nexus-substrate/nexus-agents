/**
 * Tests for opencode.json gateway-config bridge (#2503).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockReadFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn<(path: string, encoding: string) => string>(),
}));

vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
}));

import { readOpencodeGateway } from './opencode-bridge.js';

describe('readOpencodeGateway', () => {
  let savedProxyKey: string | undefined;
  let savedMissing: string | undefined;

  beforeEach(() => {
    savedProxyKey = process.env['WORKSPACE_PROXY_KEY'];
    savedMissing = process.env['MISSING_VAR'];
    delete process.env['WORKSPACE_PROXY_KEY'];
    delete process.env['MISSING_VAR'];
    mockReadFileSync.mockReset();
  });

  afterEach(() => {
    if (savedProxyKey === undefined) delete process.env['WORKSPACE_PROXY_KEY'];
    else process.env['WORKSPACE_PROXY_KEY'] = savedProxyKey;
    if (savedMissing === undefined) delete process.env['MISSING_VAR'];
    else process.env['MISSING_VAR'] = savedMissing;
  });

  it('returns null when the file does not exist (read throws ENOENT)', () => {
    mockReadFileSync.mockImplementation(() => {
      const err = new Error('ENOENT');
      throw err;
    });
    expect(readOpencodeGateway('/nope.json')).toBeNull();
  });

  it('returns null when the file is malformed JSON', () => {
    mockReadFileSync.mockReturnValue('{ this is not json');
    expect(readOpencodeGateway('/broken.json')).toBeNull();
  });

  it('returns null when providers section is absent', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ mcp: {} }));
    expect(readOpencodeGateway('/no-providers.json')).toBeNull();
  });

  it('returns null when providers.openai-compat is absent', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ providers: { anthropic: { options: { apiKey: 'sk-x' } } } })
    );
    expect(readOpencodeGateway('/no-compat.json')).toBeNull();
  });

  it('returns null when baseURL is missing', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        providers: { 'openai-compat': { options: { apiKey: 'sk-x' } } },
      })
    );
    expect(readOpencodeGateway('/no-baseurl.json')).toBeNull();
  });

  it('returns null when apiKey is missing', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        providers: {
          'openai-compat': { options: { baseURL: 'https://gateway.example/v1' } },
        },
      })
    );
    expect(readOpencodeGateway('/no-key.json')).toBeNull();
  });

  it('returns the resolved config when literal apiKey is provided', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        providers: {
          'openai-compat': {
            options: { baseURL: 'https://gateway.example/v1', apiKey: 'sk-literal' },
          },
        },
      })
    );
    expect(readOpencodeGateway('/literal.json')).toEqual({
      baseURL: 'https://gateway.example/v1',
      apiKey: 'sk-literal',
    });
  });

  it('resolves {env:VAR} interpolation in apiKey when the env var is set', () => {
    process.env['WORKSPACE_PROXY_KEY'] = 'sk-resolved-from-env';
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        providers: {
          'openai-compat': {
            options: {
              baseURL: 'https://gateway.example/v1',
              apiKey: '{env:WORKSPACE_PROXY_KEY}',
            },
          },
        },
      })
    );
    expect(readOpencodeGateway('/interp.json')).toEqual({
      baseURL: 'https://gateway.example/v1',
      apiKey: 'sk-resolved-from-env',
    });
  });

  it('returns null when {env:VAR} interpolation references an unset env var', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        providers: {
          'openai-compat': {
            options: {
              baseURL: 'https://gateway.example/v1',
              apiKey: '{env:MISSING_VAR}',
            },
          },
        },
      })
    );
    expect(readOpencodeGateway('/missing-env.json')).toBeNull();
  });

  it('treats whitespace-only values as missing', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        providers: {
          'openai-compat': { options: { baseURL: '   ', apiKey: 'sk-x' } },
        },
      })
    );
    expect(readOpencodeGateway('/whitespace.json')).toBeNull();
  });

  it('preserves apiKey verbatim when it does not match the {env:VAR} pattern', () => {
    // E.g. a literal "sk-{somethinghashy}" — only {env:NAME} is interpolated.
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        providers: {
          'openai-compat': {
            options: {
              baseURL: 'https://gateway.example/v1',
              apiKey: 'sk-literal-{not-an-env-ref}',
            },
          },
        },
      })
    );
    expect(readOpencodeGateway('/literal-curly.json')?.apiKey).toBe('sk-literal-{not-an-env-ref}');
  });
});
