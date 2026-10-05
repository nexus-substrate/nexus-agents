/** Replay sanitized CLI captures through the same extractResponse used by execute(). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CodexResponseParser } from './codex-parser.js';

const parser = new CodexResponseParser();
const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

// Captured 2026-10-04 using ChatGPT plan auth, codex exec --json --ephemeral
// --sandbox read-only, outside the repo. Prompt: "Reply with the single word ok.
// Do not use tools." Failure uses an unsupported model. Thread IDs sanitized.
const success = fixture('codex-live-success.jsonl');
const failure = fixture('codex-live-failure.jsonl');

describe('Codex execute() parser evidence (#7073)', () => {
  it('accepts the live captured success', () => {
    expect(parser.extractResponse(success)).toBe('ok');
  });

  it('rejects the live captured terminal failure', () => {
    expect(parser.extractResponse(failure)).toBeNull();
  });

  it('rejects a terminal failure after an answer (adversarial composition of live captures)', () => {
    // Combine the measured message with the measured failed turn to exercise
    // partial output before a terminal error, without claiming a live capture.
    const message = success.split('\n').find((line) => line.includes('agent_message'));
    expect(message).toBeDefined();
    if (message === undefined) throw new Error('missing captured agent message');
    expect(parser.extractResponse(`${message}\n${failure}`)).toBeNull();
  });

  it('preserves a successful turn after a recoverable error (live capture composition)', () => {
    const error = failure.split('\n').find((line) => line.startsWith('{"type":"error"'));
    expect(error).toBeDefined();
    if (error === undefined) throw new Error('missing captured error event');
    expect(parser.extractResponse(`${error}\n${success}`)).toBe('ok');
  });
});
