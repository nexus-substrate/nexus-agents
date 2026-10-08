/** JSON fidelity and frozen-oracle coverage for shared cloud credentials (#7315). */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { legacyRedactCredentialShapes } from '../testing/legacy-credential-patterns.js';
import { SHARED_SHAPE_SAMPLES } from '../testing/credential-corpus.js';
import { FAKE_AWS_SECRET } from '../testing/test-secrets.js';
import { sanitizeErrorDetails, sanitizeOutput } from '../security/output-sanitizer.js';
import { redactCredentialShapes } from './credential-patterns.js';

const PLACEHOLDER = '[REDACTED]';
const FAKE_AWS_SESSION = 'TESTFAKEsession0000';
const FAKE_GCP_ID = '0000000000aaaa0000';
const FAKE_GCP_KEY = '-----BEGIN PRIVATE KEY-----TESTFAKExxxx0000-----END PRIVATE KEY-----';
const FIELDS = [
  ['aws_secret_access_key', FAKE_AWS_SECRET],
  ['aws_session_token', FAKE_AWS_SESSION],
  ['private_key', FAKE_GCP_KEY],
  ['private_key_id', FAKE_GCP_ID],
] as const;
const SECRETS = [
  ...new Set([...FIELDS.map(([, value]) => value), ...SHARED_SHAPE_SAMPLES.map((s) => s.secret)]),
];
const BOUNDARIES = ['"', "'", '\\', '\n', '\t', ' ', ',', '{', '}', ':', '='];
const FRAGMENTS = [
  ...BOUNDARIES,
  ...SHARED_SHAPE_SAMPLES.map((sample) => sample.text),
  ...FIELDS.map(([key, value]) => `"${key}":"${value}"`),
  ...FIELDS.map(([key, value]) => `${key}=${value}`),
  'aws_secret_access_key=',
  'aws_session_token:',
  FAKE_AWS_SECRET,
  FAKE_AWS_SESSION,
];

function occurrences(text: string, secret: string): number {
  return text.split(secret).length - 1;
}

/** Check each secret separately: extra redaction of one cannot hide a leak of another. */
function compareCoverage(input: string): number {
  const before = legacyRedactCredentialShapes(input, PLACEHOLDER);
  const after = redactCredentialShapes(input, PLACEHOLDER);
  let redactions = 0;
  for (const secret of SECRETS) {
    const oldCount = occurrences(before, secret);
    const newCount = occurrences(after, secret);
    if (newCount > oldCount)
      expect(newCount, `${secret} in ${input}`).toBeLessThanOrEqual(oldCount);
    redactions += occurrences(input, secret) - oldCount;
  }
  return redactions;
}

function checkForms(text: string): number {
  let redactions = compareCoverage(text);
  const json = JSON.stringify({ message: text, keep: 'ok' });
  const json2 = JSON.stringify(json);
  for (const input of [json, json2]) {
    redactions += compareCoverage(input);
    const output = redactCredentialShapes(input, PLACEHOLDER);
    // As in #7322, the inner document of double-encoded JSON is a string value;
    // only its outer document's quotes are JSON boundaries for this pass.
    const parsed: unknown = JSON.parse(output);
    if (input === json && (parsed as { keep?: unknown }).keep !== 'ok') {
      expect(parsed).toMatchObject({ keep: 'ok' });
    } else if (input === json2 && typeof parsed !== 'string') {
      expect(typeof parsed).toBe('string');
    }
  }
  return redactions;
}

describe('shared cloud credential JSON boundaries', () => {
  it.each([1000000000, true, false, null, [], {}, [FAKE_AWS_SESSION], { value: FAKE_AWS_SECRET }])(
    'keeps non-string AWS fields parseable (%j)',
    (value) => {
      for (const key of ['aws_secret_access_key', 'aws_session_token']) {
        const input = JSON.stringify({ [key]: value, keep: 'ok' });
        expect(JSON.parse(redactCredentialShapes(input, PLACEHOLDER))).toEqual({
          [key]: PLACEHOLDER,
          keep: 'ok',
        });
        compareCoverage(input);
      }
    }
  );

  it.each(FIELDS)('keeps %s field syntax and adjacent data', (key, secret) => {
    const input = JSON.stringify({ [key]: secret, keep: { ok: true }, next: 42 });
    for (const sanitize of [
      redactCredentialShapes,
      sanitizeOutput,
      (text: string, placeholder: string) => sanitizeErrorDetails(text, undefined, placeholder),
    ]) {
      const output = sanitize(input, PLACEHOLDER);
      expect(output).not.toContain(secret);
      expect(JSON.parse(output)).toEqual({ [key]: PLACEHOLDER, keep: { ok: true }, next: 42 });
    }
  });

  it.each(['"', '\\', "'", ',', '{', '}'])(
    'keeps AWS value escapes atomic beside %j',
    (boundary) => {
      const input = JSON.stringify({
        message: `aws_session_token=${FAKE_AWS_SESSION}${boundary}`,
        keep: 'ok',
      });
      expect(JSON.parse(redactCredentialShapes(input, PLACEHOLDER))).toMatchObject({ keep: 'ok' });
      compareCoverage(input);
    }
  );

  it.each([254, 255, 256, 257])('keeps an escape atomic at the AWS length bound %i', (length) => {
    const value = `${'0'.repeat(length)}\\`;
    const input = JSON.stringify({ aws_secret_access_key: value, keep: 'ok' });
    expect(() => {
      JSON.parse(redactCredentialShapes(input, PLACEHOLDER));
    }).not.toThrow();
  });

  it('keeps later assignment detection after a quote in an earlier value', () => {
    const input = JSON.stringify({
      message: `aws_secret_access_key=${FAKE_AWS_SECRET}aws_session_token=${FAKE_AWS_SESSION}'aws_session_token: ${FAKE_AWS_SESSION} end`,
      keep: 'ok',
    });
    compareCoverage(input);
    expect(redactCredentialShapes(input, PLACEHOLDER)).not.toContain(FAKE_AWS_SESSION);
    expect(JSON.parse(redactCredentialShapes(input, PLACEHOLDER))).toMatchObject({ keep: 'ok' });
  });

  it('preserves plaintext legacy extents, including quotes and punctuation', () => {
    for (const sample of SHARED_SHAPE_SAMPLES) {
      if (sample.text.startsWith('{')) continue;
      expect(redactCredentialShapes(sample.text, PLACEHOLDER)).toBe(
        legacyRedactCredentialShapes(sample.text, PLACEHOLDER)
      );
    }
  });

  it.each(['$1', '$2', '$3', '$$', '$&', '$`', "$'"])(
    'preserves legacy plaintext replacement semantics for %s',
    (placeholder) => {
      for (const [key, value] of FIELDS) {
        const input = `before "${key}":"${value}" after`;
        expect(redactCredentialShapes(input, placeholder)).toBe(
          legacyRedactCredentialShapes(input, placeholder)
        );
      }
    }
  );
});

describe('differential: shared patterns never redact fewer fixture secrets', () => {
  it('covers 20,000 seeded cases in plain, JSON and double-encoded JSON forms', () => {
    const corpus = fc.sample(
      fc.array(fc.constantFrom(...FRAGMENTS), { minLength: 2, maxLength: 10 }),
      { seed: 7315, numRuns: 20_000 }
    );
    let oldRedactions = 0;
    for (const parts of corpus) oldRedactions += checkForms(parts.join(''));
    expect(oldRedactions).toBeGreaterThan(1_000);
  });

  it('preserves coverage and JSON near quotes, commas and braces', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FIELDS),
        fc.array(fc.constantFrom(...BOUNDARIES), { maxLength: 8 }),
        fc.array(fc.constantFrom(...BOUNDARIES), { maxLength: 8 }),
        ([key, secret], left, right) => {
          checkForms(`${left.join('')}"${key}":"${secret}"${right.join('')}`);
          const input = JSON.stringify({
            [key]: secret,
            context: left.join('') + right.join(''),
            keep: 'ok',
          });
          compareCoverage(input);
          expect(JSON.parse(redactCredentialShapes(input, PLACEHOLDER))).toEqual({
            [key]: PLACEHOLDER,
            context: left.join('') + right.join(''),
            keep: 'ok',
          });
        }
      ),
      { seed: 7315, numRuns: 1000 }
    );
  });

  it('preserves arbitrary AWS JSON values and their siblings', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('aws_secret_access_key', 'aws_session_token'),
        fc.oneof(fc.constantFrom(FAKE_AWS_SECRET, FAKE_AWS_SESSION), fc.jsonValue()),
        (key, value) => {
          const input = JSON.stringify([{ [key]: value, keep: { ok: true } }, 42]);
          compareCoverage(input);
          const parsed: unknown = JSON.parse(redactCredentialShapes(input, PLACEHOLDER));
          expect(parsed).toEqual([expect.objectContaining({ keep: { ok: true } }), 42]);
        }
      ),
      { seed: 7316, numRuns: 1000 }
    );
  });
});
