/** Inherited envelopes replay extractResponse; execute replay lives in cli-result-evidence.test.ts. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ClaudeResponseParser } from './claude-parser.js';

const parser = new ClaudeResponseParser();
const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('Claude execute() parser evidence (#7073)', () => {
  it('accepts the inherited, unverified result envelope (#5241)', () => {
    // Inherited, unverified: claude-cost.test.ts REAL_RESULT uses sess-abc.
    // This fixture has no independently retained raw live-capture evidence.
    expect(parser.extractResponse(fixture('claude-existing-live-success.json'))).toBe('done');
  });

  it('rejects the inherited, unverified error despite subtype success (#6120)', () => {
    // Reduced from the envelope measured on 2026-09-13 and reproduced in
    // adapters/claude-adapter-is-error.test.ts; these are its verdict fields.
    const raw = fixture('claude-existing-measured-error.json');
    expect(parser.extractResponse(raw)).toBeNull();
    expect(parser.extractErrorMessage(raw)).toContain("You're out of usage credits.");
  });
});
