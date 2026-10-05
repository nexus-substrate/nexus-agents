import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OpenCodeResponseParser } from './opencode-parser.js';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const parser = new OpenCodeResponseParser();
const success = fixture('opencode-success.jsonl');

describe('OpenCode execute parser evidence (#7073)', () => {
  it('replays the inherited, unverified v1.2.15 success through extractResponse', () => {
    expect(parser.extractResponse(success)).toBe('OK');
  });

  it('rejects the captured live invalid-model failure', () => {
    expect(parser.extractResponse(fixture('opencode-failure.jsonl'))).toBeNull();
  });

  // documented-format, unverified against a live capture: derived nonterminal ending.
  it('rejects tool-calls: documented-format, unverified against a live capture', () => {
    expect(parser.extractResponse(fixture('opencode-tool-calls.documented.jsonl'))).toBeNull();
  });

  it.each(['content-filter', 'error', 'tool-calls', 'other', 'unknown', 'unrecognized', undefined])(
    'rejects a final reason %s even with partial text (derived capture)',
    (reason) => {
      const events = success
        .trim()
        .split('\n')
        .map(
          (line) =>
            JSON.parse(line) as {
              part: { reason?: string };
            }
        );
      const last = events.at(-1);
      if (last === undefined) throw new Error('missing fixture completion');
      if (reason === undefined) delete last.part.reason;
      else last.part.reason = reason;
      expect(
        parser.extractResponse(events.map((event) => JSON.stringify(event)).join('\n'))
      ).toBeNull();
    }
  );

  it.each(['content', 'result', 'text', 'output'])(
    'rejects an unverified plain JSON %s envelope without a terminal event (synthetic)',
    (field) => {
      expect(parser.extractResponse(JSON.stringify({ [field]: 'Plain JSON text' }))).toBeNull();
    }
  );

  it.each(['opencode-default', 'opencode-custom-opus', 'opencode-custom-sonnet'])(
    'replays the live unavailable-model failure for %s with no final reason',
    (model) => {
      const raw = fixture(`${model}-live.jsonl`);
      expect(raw.trim()).not.toBe('');
      expect(parser.extractResponse(raw)).toBeNull();
      expect(parser.extractErrorMessage(raw)).toContain('Model not found:');
      const provenance = JSON.parse(fixture(`${model}-live.provenance.json`)) as {
        exitCode: number;
        finalFinishReason: string | null;
      };
      expect(provenance.exitCode).toBe(1);
      expect(provenance.finalFinishReason).toBeNull();
    }
  );

  it('accepts stop as a successful final reason (inherited evidence)', () => {
    expect(parser.extractResponse(success)).toBe('OK');
  });

  it('accepts length only with produced text (derived capture; response has no truncation field)', () => {
    const raw = success.replace('"reason":"stop"', '"reason":"length"');
    expect(parser.extractResponse(raw)).toBe('OK');
  });

  it.each(['', '   '])('rejects length without produced text %j (derived)', (text) => {
    const raw = [
      { type: 'text', part: { text } },
      { type: 'step_finish', part: { reason: 'length' } },
    ]
      .map((event) => JSON.stringify(event))
      .join('\n');
    expect(parser.extractResponse(raw)).toBeNull();
  });

  it.each(['content-filter', 'error', 'tool-calls', 'other', 'unknown', undefined])(
    'rejects legacy completion reason %s even with text (synthetic, unverified)',
    (reason) => {
      const raw = [
        { type: 'message.delta', content: 'Partial text' },
        { type: 'session.complete', reason },
      ]
        .map((event) => JSON.stringify(event))
        .join('\n');
      expect(parser.extractResponse(raw)).toBeNull();
    }
  );

  it('rejects legacy text without any terminal event (synthetic, unverified)', () => {
    expect(parser.extractResponse('{"type":"message.delta","content":"Partial text"}')).toBeNull();
  });

  it.each(['stop', 'length'])(
    'accepts legacy terminal reason %s with text (synthetic)',
    (reason) => {
      const raw = [
        { type: 'message.delta', content: 'Text' },
        { type: 'session.complete', reason },
      ]
        .map((event) => JSON.stringify(event))
        .join('\n');
      expect(parser.extractResponse(raw)).toBe('Text');
    }
  );

  it('rejects legacy text beginning after a terminal stop (synthetic)', () => {
    const raw = [
      { type: 'session.complete', reason: 'stop' },
      { type: 'message.delta', content: 'Partial text' },
    ]
      .map((event) => JSON.stringify(event))
      .join('\n');
    expect(parser.extractResponse(raw)).toBeNull();
  });

  it('rejects a stream truncated before its completion (derived capture)', () => {
    expect(parser.extractResponse(success.trim().split('\n').slice(0, -1).join('\n'))).toBeNull();
  });

  it('rejects an error after completed text (derived captures)', () => {
    expect(parser.extractResponse(success + fixture('opencode-failure.jsonl'))).toBeNull();
  });

  it('rejects an error without an error payload: documented-format, unverified against a live capture', () => {
    // documented-format, unverified against a live capture: missing error detail.
    expect(parser.extractResponse('{"type":"error"}')).toBeNull();
  });

  it('accepts an intermediate tool-calls step followed by captured stop (derived capture)', () => {
    expect(parser.extractResponse(fixture('opencode-tool-calls.documented.jsonl') + success)).toBe(
      'OK'
    );
  });

  it('rejects a new step after stop until completed (derived capture)', () => {
    const start = success.split('\n')[0];
    if (start === undefined) throw new Error('missing captured step start');
    expect(parser.extractResponse(success + start)).toBeNull();
  });
});
