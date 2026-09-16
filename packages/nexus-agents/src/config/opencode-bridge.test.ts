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
import type { ILogger } from '../core/index.js';

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

  // #4392 inc 3, no-logging parity (increment-2 item 5): the parse-error
  // message on Node 22 embeds a snippet of the SOURCE, so a hand-edited file
  // with an unquoted key leaked it into the warn line.
  describe('never logs the file contents or the key (#4392 inc 3)', () => {
    // Deliberately matches no sanitizer pattern: the test is about what the
    // bridge puts on the line, not about what a downstream scrubber removes.
    const UNQUOTED_KEY = 'zq7TESTFAKEunquotedNOTREAL0000';

    it('logs only the error name — not the message — when the file is not valid JSON', () => {
      mockReadFileSync.mockReturnValue(
        `{"providers": {"openai-compat": {"options": {"apiKey": ${UNQUOTED_KEY}}}}}`
      );
      const logger = makeLogger();
      expect(readOpencodeGateway('/unquoted.json', logger)).toBeNull();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(allCalls(logger)).not.toContain(UNQUOTED_KEY);
      expect(allCalls(logger)).toContain('SyntaxError');
    });

    it('logs the gateway hostname only on success — never the full URL (userinfo-capable)', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          providers: {
            'openai-compat': {
              options: {
                baseURL: 'https://u:pw-TESTFAKE@gateway.example/v1',
                apiKey: 'sk-TESTFAKE-literal-NOT-REAL-0000',
              },
            },
          },
        })
      );
      const logger = makeLogger();
      expect(readOpencodeGateway('/userinfo.json', logger)?.baseURL).toBe(
        'https://u:pw-TESTFAKE@gateway.example/v1'
      );
      const flat = allCalls(logger);
      expect(flat).toContain('gateway.example');
      expect(flat).not.toContain('pw-TESTFAKE');
      expect(flat).not.toContain('sk-TESTFAKE-literal');
    });
  });
});
