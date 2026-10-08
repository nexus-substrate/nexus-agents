/** The logger's redaction keeps cloud-credential JSON documents valid (#7315). */
import { describe, expect, it } from 'vitest';
import { legacyRedactCredentialShapes } from '../testing/legacy-credential-patterns.js';
import { FAKE_AWS_SECRET } from '../testing/test-secrets.js';
import { sanitize, sanitizeDeep } from './logger.js';

const FAKE_SESSION = 'TESTFAKEsession0000';
const FAKE_KEY_ID = '0000000000aaaa0000';
const FAKE_GCP_KEY = '-----BEGIN PRIVATE KEY-----TESTFAKExxxx0000-----END PRIVATE KEY-----';
const FAKE_VALUE = 'TESTFAKE_value_0000';
const FIELDS = [
  ['aws_secret_access_key', FAKE_AWS_SECRET],
  ['aws_session_token', FAKE_SESSION],
  ['AWS_SESSION_TOKEN', FAKE_SESSION],
  ['private_key', FAKE_GCP_KEY],
  ['private_key_id', FAKE_KEY_ID],
] as const;

/** FROZEN pre-#7315 logger context rules, the oracle for "never redacts less". */
const LEGACY_LOGGER_RULES: readonly RegExp[] = [
  /Bearer [a-zA-Z0-9-_.]+/g,
  /password["']?[ \t]*[:=][ \t]*["']?[^"'\s]{1,256}/gi,
  /api[_-]?key["']?[ \t]*[:=][ \t]*["']?[^"'\s]{1,256}/gi,
  /secret["']?[ \t]*[:=][ \t]*["']?[^"'\s]{1,256}/gi,
  /token["']?[ \t]*[:=][ \t]*["']?[^"'\s]{1,256}/gi,
];

function legacySanitize(text: string): string {
  let result = legacyRedactCredentialShapes(text, '[REDACTED]');
  for (const rule of LEGACY_LOGGER_RULES) result = result.replace(rule, '[REDACTED]');
  return result;
}

const occurrences = (text: string, secret: string): number => text.split(secret).length - 1;

describe('logger sanitize on cloud-credential JSON', () => {
  it.each(FIELDS)('redacts %s and keeps the document parseable', (key, secret) => {
    const input = JSON.stringify({ [key]: secret, keep: 'ok' });
    const output = sanitize(input);
    expect(output).not.toContain(secret);
    expect(JSON.parse(output)).toEqual({ [key]: '[REDACTED]', keep: 'ok' });
    const logged = sanitizeDeep({ body: input }) as { body: string };
    expect(JSON.parse(logged.body)).toEqual({ [key]: '[REDACTED]', keep: 'ok' });
  });

  it.each(['token', 'password', 'api_key', 'secret'])(
    'keeps a JSON %s field parseable for every value type',
    (key) => {
      for (const value of [FAKE_VALUE, 12345, [FAKE_VALUE]]) {
        const input = JSON.stringify({ [key]: value, keep: 'ok' });
        const output = sanitize(input);
        expect(output).not.toContain(FAKE_VALUE);
        expect(output).not.toContain('12345');
        expect(JSON.parse(output)).toMatchObject({ keep: 'ok' });
      }
    }
  );

  it('never redacts less than the frozen pre-#7315 logger', () => {
    const forms = (text: string): string[] => [
      text,
      JSON.stringify({ message: text, keep: 'ok' }),
      JSON.stringify(JSON.stringify({ message: text, keep: 'ok' })),
    ];
    const pieces = [
      ...FIELDS.map(([key, value]) => `"${key}":"${value}"`),
      ...FIELDS.map(([key, value]) => `${key}=${value}`),
      `token=${FAKE_VALUE}`,
      `password: "${FAKE_VALUE}"`,
      `"secret":"${FAKE_VALUE}"`,
      '"',
      "'",
      '\\',
      ' ',
      ',',
      '\n',
    ];
    const secrets = [...new Set([...FIELDS.map(([, value]) => value), FAKE_VALUE])];
    let legacyRedactions = 0;
    for (let i = 0; i < pieces.length; i++) {
      for (let j = 0; j < pieces.length; j++) {
        for (const input of forms(`${pieces[i] ?? ''}${pieces[j] ?? ''}`)) {
          const before = legacySanitize(input);
          const after = sanitize(input);
          for (const secret of secrets) {
            legacyRedactions += occurrences(input, secret) - occurrences(before, secret);
            expect(occurrences(after, secret), input).toBeLessThanOrEqual(
              occurrences(before, secret)
            );
          }
        }
      }
    }
    expect(legacyRedactions).toBeGreaterThan(100);
  });
});
