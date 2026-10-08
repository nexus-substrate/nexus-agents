/** JSON fidelity regressions for MCP output redaction (#7296). */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { legacySanitizeErrorDetails } from '../testing/legacy-sanitize-error-details.js';
import { FAKE_BEARER_TOKEN, FAKE_OPENAI_KEY, FAKE_PASSWORD } from '../testing/test-secrets.js';
import { sanitizeErrorDetails, REDACTED_KEY_PLACEHOLDER } from './output-sanitizer.js';

const VALUE = FAKE_PASSWORD.slice('password='.length);
const TOKEN = FAKE_BEARER_TOKEN.slice('Bearer '.length);

/** Fragments that steer a generator onto every context rule and JSON boundary. */
const TRIGGERS = [
  'password=',
  'passwd = ',
  'secret:',
  '?token=',
  '&api_key=',
  'authorization: Bearer ',
  'Authorization: Basic ',
  'bearer ',
  'semgrep:',
  'generic-',
  '"',
  "'",
  '\\',
  '\n',
  '\r\n',
  '\t',
  ' ',
  ',',
  '{',
  '}',
  ':',
  'ab',
  VALUE,
];

/** TRIGGERS without the fake value, so a context never spells an unredactable `0password=…`. */
const CONTEXT_TRIGGERS = TRIGGERS.filter((trigger) => trigger !== VALUE);

function triggerBiasedText(): fc.Arbitrary<string> {
  return fc
    .array(fc.oneof(fc.constantFrom(...CONTEXT_TRIGGERS), fc.string({ maxLength: 4 })), {
      maxLength: 12,
    })
    .map((parts) => parts.join(''));
}

/** Deterministic PRNG (mulberry32) so the differential corpus is identical on every run. */
function seededRandom(seed: number): (bound: number) => number {
  let state = seed;
  return (bound) => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * bound);
  };
}

const occurrences = (text: string): number => text.split(VALUE).length - 1;

describe('sanitizeErrorDetails JSON boundaries (#7296)', () => {
  it('still redacts an actual generic-secret colon assignment outside a rule id', () => {
    const secret = FAKE_PASSWORD.replace(/^password=/, '');
    expect(sanitizeErrorDetails(`generic-secret:${secret}`)).toBe(
      `generic-secret:${REDACTED_KEY_PLACEHOLDER}`
    );
  });

  it('redacts a 10 MB assignment without overflowing the regex stack', () => {
    const secret = `${FAKE_PASSWORD}${'x'.repeat(10 * 1024 * 1024)}`;
    expect(sanitizeErrorDetails(secret)).toBe(`password=${REDACTED_KEY_PLACEHOLDER}`);
  });

  it.each(['config.', 'db-', 'generic-secret='])(
    'retains assignment detection after %s',
    (prefix) => {
      expect(sanitizeErrorDetails(`${prefix}${FAKE_PASSWORD}`)).toBe(
        prefix === 'generic-secret='
          ? `generic-secret=${REDACTED_KEY_PLACEHOLDER}`
          : `${prefix}password=${REDACTED_KEY_PLACEHOLDER}`
      );
    }
  );

  it.each([FAKE_PASSWORD.replace(/(password=..)(.).*/, '$1\\$2'), `${FAKE_PASSWORD}\\`])(
    'redacts complete plaintext backslash values %s',
    (input) => {
      expect(sanitizeErrorDetails(input)).toBe(`password=${REDACTED_KEY_PLACEHOLDER}`);
    }
  );

  it.each([1, 4242])('preserves a semgrep rule id at line %i', (line) => {
    const finding = {
      id: `semgrep:detected-generic-secret:src/example.ts:${String(line)}`,
      severity: 'high',
    };
    const output = sanitizeErrorDetails(JSON.stringify({ findings: [finding] }));
    expect(JSON.parse(output)).toEqual({ findings: [finding] });
  });

  it('redacts real secret values while preserving adjacent fields', () => {
    const output = sanitizeErrorDetails(
      JSON.stringify({ secret: FAKE_PASSWORD, echo: FAKE_OPENAI_KEY, keep: 'ok' })
    );
    expect(output).not.toContain(FAKE_PASSWORD);
    expect(output).not.toContain(FAKE_OPENAI_KEY);
    expect(JSON.parse(output)).toEqual({
      secret: REDACTED_KEY_PLACEHOLDER,
      echo: REDACTED_KEY_PLACEHOLDER,
      keep: 'ok',
    });
  });

  it.each([
    [FAKE_PASSWORD, `password=${REDACTED_KEY_PLACEHOLDER}`],
    [`secret:${FAKE_PASSWORD}`, `secret:${REDACTED_KEY_PLACEHOLDER}`],
    [`authorization: Bearer ${FAKE_PASSWORD}`, `authorization: Bearer ${REDACTED_KEY_PLACEHOLDER}`],
    [`authorization: Basic ${FAKE_PASSWORD}`, `authorization: Basic ${REDACTED_KEY_PLACEHOLDER}`],
    [
      `https://example.test/?token=${FAKE_PASSWORD}`,
      `https://example.test/?token=${REDACTED_KEY_PLACEHOLDER}`,
    ],
  ])('redacts only the credential span in JSON string %s', (message, redacted) => {
    const output = sanitizeErrorDetails(JSON.stringify({ message, keep: 'ok' }));
    expect(output).not.toContain(FAKE_PASSWORD);
    expect(output).toContain(REDACTED_KEY_PLACEHOLDER);
    expect(JSON.parse(output)).toEqual({
      message: redacted,
      keep: 'ok',
    });
  });

  it.each(['\n', '\r\n'])('ends a plain-text value at the line end (%j)', (end) => {
    expect(sanitizeErrorDetails(`${FAKE_PASSWORD}${end}public diagnostic`)).toBe(
      `password=${REDACTED_KEY_PLACEHOLDER}${end}public diagnostic`
    );
  });

  it.each(['"', '\\', '\n'])('keeps complete JSON escapes within a redacted token (%j)', (end) => {
    const output = sanitizeErrorDetails(JSON.stringify({ message: `${FAKE_PASSWORD}${end} keep` }));
    expect(output).not.toContain(FAKE_PASSWORD);
    expect(JSON.parse(output)).toEqual({
      message: `password=${REDACTED_KEY_PLACEHOLDER} keep`,
    });
  });

  it.each(['\\', "'", '"'])('redacts entire credential values containing %j', (separator) => {
    const secret = FAKE_PASSWORD.replace('TESTFAKE', `TE${separator}STFAKE`);
    const output = sanitizeErrorDetails(
      JSON.stringify({
        message: secret,
        auth: `authorization: Basic ${secret}`,
        url: `https://example.test/?token=${secret}`,
        keep: 'ok',
      })
    );
    expect(JSON.parse(output)).toEqual({
      message: `password=${REDACTED_KEY_PLACEHOLDER}`,
      auth: `authorization: Basic ${REDACTED_KEY_PLACEHOLDER}`,
      url: `https://example.test/?token=${REDACTED_KEY_PLACEHOLDER}`,
      keep: 'ok',
    });
  });

  it('round-trips random JSON objects containing secret-like values', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), fc.jsonValue()),
        triggerBiasedText(),
        fc.constantFrom('', '\\', "'", '"'),
        (data, context, separator) => {
          // `data` must hold nothing redactable on its own, so any change to it is bleed.
          fc.pre(sanitizeErrorDetails(JSON.stringify(data)) === JSON.stringify(data));
          const credential = FAKE_PASSWORD.replace('TESTFAKE', `TE${separator}STFAKE`);
          const input = { context, data, nested: [{ credential, key: FAKE_OPENAI_KEY }] };
          const output = sanitizeErrorDetails(JSON.stringify(input));
          expect(output).not.toContain(FAKE_PASSWORD);
          expect(output).not.toContain(FAKE_OPENAI_KEY);
          const parsed = JSON.parse(output) as typeof input;
          expect(parsed.data).toEqual(JSON.parse(JSON.stringify(data)));
          expect(parsed.nested).toEqual([
            { credential: `password=${REDACTED_KEY_PLACEHOLDER}`, key: REDACTED_KEY_PLACEHOLDER },
          ]);
        }
      ),
      { numRuns: 1000, seed: 7296 }
    );
  });
});

describe('plain-text redaction is never narrower than before #7296', () => {
  it.each([
    ['a double-quoted bearer token', `Authorization: Bearer "${TOKEN}"`],
    ['a single-quoted basic credential', `Authorization: Basic '${VALUE}'`],
    ['a quote inside a password', `password=ab"${VALUE}`],
    ['a quoted password', `password="ab"${VALUE}`],
    ['a quote inside a query token', `https://example.test/?token=ab"${VALUE}`],
    ['a password on the next line', `password=\n${VALUE}`],
    ['a secret on the next line', `secret:\r\n  ${VALUE}`],
    ['a bearer token on the next line', `bearer\n${TOKEN}`],
    ['an authorization header across lines', `Authorization:\nBearer ${TOKEN}`],
  ])('redacts %s as the pre-#7296 redactor did', (_name, input) => {
    const output = sanitizeErrorDetails(input);
    expect(output).not.toContain(VALUE);
    expect(output).not.toContain(TOKEN);
    expect(output).toBe(legacySanitizeErrorDetails(input));
  });

  it.each([
    ['a space after the rule id colon', `semgrep:detected-generic-secret: ${VALUE}`],
    ['no file:line after the rule id', `semgrep:detected-generic-secret:${VALUE}`],
    ['a non-rule-id character before generic-', `semgrep:x/generic-secret:${VALUE}`],
  ])('redacts a generic-secret assignment with %s', (_name, input) => {
    expect(sanitizeErrorDetails(input)).not.toContain(VALUE);
  });

  it('still preserves a plain-text semgrep finding id', () => {
    const input = 'semgrep:rules.detected-generic-secret:src/example.ts:12 found';
    expect(sanitizeErrorDetails(input)).toBe(input);
  });

  it.each([
    ['password=', 12345678],
    ['Authorization: Bearer ', 1],
  ])('never absorbs the closing quote of a JSON string ending in %j', (prefix, next) => {
    const input = JSON.stringify([prefix, next]);
    expect(JSON.parse(sanitizeErrorDetails(input))).toEqual([prefix, next]);
  });
});

describe('the frozen pre-#7296 oracle', () => {
  it('applies the frozen pre-#7315 credential-shape layer, not the live one', () => {
    const input = JSON.stringify({ aws_session_token: VALUE, keep: 'ok' });
    // Before #7315 the shape match took the key, its quotes and the value as one span.
    expect(legacySanitizeErrorDetails(input)).toBe(`{"${REDACTED_KEY_PLACEHOLDER}","keep":"ok"}`);
  });
});

describe('differential: the #7296 redactor against the frozen pre-#7296 one', () => {
  it('redacts every secret the old code redacted, and keeps JSON parseable', () => {
    const random = seededRandom(7296);
    const narrower: string[] = [];
    const unparseable: string[] = [];
    let oldRedactions = 0;
    for (let i = 0; i < 20_000; i++) {
      let text = '';
      const parts = 2 + random(8);
      for (let j = 0; j < parts; j++) text += TRIGGERS[random(TRIGGERS.length)] ?? '';
      const forms = [
        ['plain', text],
        ['json', JSON.stringify({ m: text, k: 'ok' })],
        ['json2', JSON.stringify(JSON.stringify({ m: text, k: 'ok' }))],
      ] as const;
      for (const [form, input] of forms) {
        const before = legacySanitizeErrorDetails(input);
        const after = sanitizeErrorDetails(input);
        if (occurrences(before) < occurrences(input)) oldRedactions++;
        if (occurrences(after) > occurrences(before)) narrower.push(`${form}: ${input}`);
        if (form === 'plain') continue;
        try {
          const parsed: unknown = JSON.parse(after);
          // Double-encoded: the outer document parses; the inner layer is a value of
          // one JSON string, and its own quotes were never boundaries (nor before #7296).
          if (form === 'json2') expect(typeof parsed).toBe('string');
          else expect(parsed).toMatchObject({ k: 'ok' });
        } catch {
          unparseable.push(`${form}: ${input}`);
        }
      }
    }
    // A corpus the old code never redacted in would make this pass vacuously.
    expect(oldRedactions).toBeGreaterThan(1_000);
    expect(narrower.slice(0, 5)).toEqual([]);
    expect(unparseable.slice(0, 5)).toEqual([]);
  });
});
