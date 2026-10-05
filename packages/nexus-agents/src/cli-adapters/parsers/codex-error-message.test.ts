/** Terminal Codex errors retain their CLI message (#7073). */
import { describe, expect, it } from 'vitest';
import type { ICliResponseParser } from '../types.js';
import { CodexResponseParser } from './codex-parser.js';

const parser: ICliResponseParser = new CodexResponseParser();
const ndjson = (...events: object[]): string =>
  events.map((event) => JSON.stringify(event)).join('\n');

describe('Codex terminal error messages (#7073)', () => {
  it('extracts turn.failed.error.message instead of an earlier diagnostic', () => {
    const raw = ndjson(
      { type: 'error', message: 'earlier diagnostic' },
      { type: 'turn.failed', error: { message: 'The selected model is unsupported.' } }
    );
    expect(parser.extractErrorMessage?.(raw)).toBe('The selected model is unsupported.');
  });

  it('extracts the terminal error event message when turn.failed omits it', () => {
    const raw = ndjson(
      { type: 'error', message: 'The selected model is unsupported.' },
      { type: 'turn.failed', error: {} }
    );
    expect(parser.extractErrorMessage?.(raw)).toBe('The selected model is unsupported.');
  });

  it('extracts a lone error event carrying the terminal message', () => {
    expect(
      parser.extractErrorMessage?.(ndjson({ type: 'error', message: 'Invalid request.' }))
    ).toBe('Invalid request.');
  });

  it('does not surface an error recovered by a completed turn', () => {
    const raw = ndjson({ type: 'error', message: 'temporary failure' }, { type: 'turn.completed' });
    expect(parser.extractErrorMessage?.(raw)).toBeNull();
  });

  it.each(['', 'not JSON', '{"type":"turn.failed","error":{"message":123}}'])(
    'does not invent a terminal message for %j',
    (raw) => {
      expect(parser.extractErrorMessage?.(raw)).toBeNull();
    }
  );
});
