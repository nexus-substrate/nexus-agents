/** Secret-named JSON keys in `sanitizeErrorDetails` keep JSON valid (#7315). */
import { describe, expect, it } from 'vitest';
import { legacySanitizeErrorDetails } from '../testing/legacy-sanitize-error-details.js';
import { FAKE_AWS_SECRET, FAKE_PASSWORD } from '../testing/test-secrets.js';
import { REDACTED_KEY_PLACEHOLDER, sanitizeErrorDetails } from './output-sanitizer.js';

const FAKE_CLIENT_SECRET = 'TESTFAKE_client_secret_0000';
const FAKE_SESSION = 'TESTFAKEsession0000';
const FAKE_KEY_ID = '0000000000aaaa0000';
const PASSWORD_VALUE = FAKE_PASSWORD.slice('password='.length);
const SECRETS = [FAKE_CLIENT_SECRET, FAKE_SESSION, FAKE_KEY_ID, FAKE_AWS_SECRET, PASSWORD_VALUE];

const occurrences = (text: string, secret: string): number => text.split(secret).length - 1;

describe('secret-named JSON keys', () => {
  it('redacts client_secret after an AWS field and a password message in compact JSON', () => {
    const input = JSON.stringify({
      aws_session_token: FAKE_SESSION,
      msg: FAKE_PASSWORD,
      client_secret: FAKE_CLIENT_SECRET,
    });
    const output = sanitizeErrorDetails(input);
    for (const secret of SECRETS) expect(output).not.toContain(secret);
    expect(JSON.parse(output)).toMatchObject({ client_secret: REDACTED_KEY_PLACEHOLDER });
  });

  it.each([
    'client_secret',
    'CLIENT_SECRET',
    'app-secret',
    'private_key',
    'private_key_id',
    'secret_access_key',
    'aws_secret_access_key',
  ])('redacts every JSON value type under %s and keeps the document parseable', (key) => {
    for (const value of [
      FAKE_CLIENT_SECRET,
      12345,
      [FAKE_CLIENT_SECRET],
      { v: FAKE_CLIENT_SECRET },
    ]) {
      const input = JSON.stringify({ [key]: value, keep: { ok: true } });
      const output = sanitizeErrorDetails(input);
      expect(output).not.toContain(FAKE_CLIENT_SECRET);
      expect(output).not.toContain('12345');
      expect(JSON.parse(output)).toEqual({ [key]: REDACTED_KEY_PLACEHOLDER, keep: { ok: true } });
    }
  });

  it.each([1, 2, 3])('redacts secret-named keys in JSON encoded %i levels deep', (levels) => {
    let input = JSON.stringify({ client_secret: FAKE_CLIENT_SECRET, private_key_id: FAKE_KEY_ID });
    for (let level = 0; level < levels; level++) input = JSON.stringify({ message: input });
    let decoded: unknown = sanitizeErrorDetails(input);
    expect(decoded).not.toContain(FAKE_CLIENT_SECRET);
    expect(decoded).not.toContain(FAKE_KEY_ID);
    for (let level = 0; level <= levels; level++) {
      decoded = JSON.parse(
        level === 0 ? (decoded as string) : (decoded as { message: string }).message
      );
    }
    expect(decoded).toEqual({
      client_secret: REDACTED_KEY_PLACEHOLDER,
      private_key_id: REDACTED_KEY_PLACEHOLDER,
    });
  });

  it.each([0, 1, 2])('encodes a placeholder with quotes at nesting level %i', (levels) => {
    const placeholder = 'red"act\\ed';
    let input = JSON.stringify({ client_secret: FAKE_CLIENT_SECRET });
    for (let level = 0; level < levels; level++) input = JSON.stringify({ message: input });
    let decoded: unknown = JSON.parse(sanitizeErrorDetails(input, undefined, placeholder));
    for (let level = 0; level < levels; level++) {
      decoded = JSON.parse((decoded as { message: string }).message);
    }
    expect(decoded).toEqual({ client_secret: placeholder });
  });

  it('stops a nested key value at the end of its enclosing string', () => {
    const input = JSON.stringify({
      message: `\"client_secret\":\"${FAKE_CLIENT_SECRET}`,
      keep: 'ok',
    });
    expect(JSON.parse(sanitizeErrorDetails(input))).toMatchObject({ keep: 'ok' });
  });

  it.each([1, 3])(
    'redacts an AWS value quoted with an escaped quote (%i backslashes) after a password',
    (backslashes) => {
      const quote = `${'\\'.repeat(backslashes)}"`;
      const message = `password=${PASSWORD_VALUE} aws_secret_access_key=${quote}${FAKE_AWS_SECRET}${quote} end`;
      const input = JSON.stringify({ message, keep: 'ok' });
      const output = sanitizeErrorDetails(input);
      expect(output).not.toContain(FAKE_AWS_SECRET);
      expect(JSON.parse(output)).toMatchObject({ keep: 'ok' });
    }
  );

  it('leaves keys that only contain a secret word unchanged', () => {
    const input = JSON.stringify({ secretary: 'ok', private_key_path: 'ok', secret_santa: 'ok' });
    expect(sanitizeErrorDetails(input)).toBe(input);
  });
});

/** Deterministic PRNG (mulberry32) so the corpus is identical on every run. */
function seededRandom(seed: number): (bound: number) => number {
  let state = seed;
  return (bound) => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * bound);
  };
}

describe('differential: compact cloud-credential JSON against the frozen oracle', () => {
  it('redacts every fixture secret the frozen redactor did, and keeps JSON parseable', () => {
    const random = seededRandom(7315);
    const keys = [
      'aws_secret_access_key',
      'aws_session_token',
      'AWS_SESSION_TOKEN',
      'private_key_id',
    ];
    const values: unknown[] = [FAKE_AWS_SECRET, FAKE_SESSION, FAKE_KEY_ID, [FAKE_SESSION], 12345];
    const narrower: string[] = [];
    let oldClientSecretRedactions = 0;
    for (let i = 0; i < 2_000; i++) {
      const key = keys[random(keys.length)] ?? 'aws_session_token';
      const object = {
        [key]: values[random(values.length)],
        keep: 'ok',
        msg: FAKE_PASSWORD,
        client_secret: FAKE_CLIENT_SECRET,
      };
      for (const input of [JSON.stringify(object), JSON.stringify(object, null, 2)]) {
        const before = legacySanitizeErrorDetails(input);
        const after = sanitizeErrorDetails(input);
        if (!before.includes(FAKE_CLIENT_SECRET)) oldClientSecretRedactions++;
        for (const secret of SECRETS) {
          if (occurrences(after, secret) > occurrences(before, secret)) narrower.push(input);
        }
        expect(JSON.parse(after)).toMatchObject({ keep: 'ok' });
      }
    }
    // A corpus where the oracle never redacted client_secret would pass vacuously.
    expect(oldClientSecretRedactions).toBeGreaterThan(1_000);
    expect(narrower.slice(0, 5)).toEqual([]);
  });
});
