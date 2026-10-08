/**
 * FROZEN copy of the context-rule layer of `sanitizeErrorDetails` as it stood
 * before #7296, kept as the oracle for the differential test in
 * `security/output-sanitizer-json.test.ts`. The #7296 invariant is that the
 * current redactor never redacts less than this one, except that it may stop
 * at a JSON string boundary when the value sits inside a JSON string.
 *
 * Do not edit to track the live implementation: a drifting oracle proves
 * nothing. `sanitizeOutput` (the credential-shape layer) is imported rather
 * than copied because #7296 does not change it.
 *
 * @module testing/legacy-sanitize-error-details
 */

import { REDACTED_KEY_PLACEHOLDER, sanitizeOutput } from '../security/output-sanitizer.js';

/** `sanitizeErrorDetails` at the commit before #7296, verbatim. */
export function legacySanitizeErrorDetails(
  text: string,
  apiKey?: string,
  placeholder: string = REDACTED_KEY_PLACEHOLDER
): string {
  if (text === '') return '';

  let result = text;
  if (apiKey !== undefined && apiKey.trim() !== '') {
    result = result.replaceAll(apiKey.trim(), placeholder);
  }

  result = sanitizeOutput(result, placeholder);

  result = result.replace(/(authorization:\s*bearer\s+)\S+/gi, `$1${placeholder}`);
  result = result.replace(/(authorization:\s*basic\s+)\S+/gi, `$1${placeholder}`);
  result = result.replace(/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, `$1${placeholder}`);

  result = result.replace(/(\b(?:password|passwd|secret)\s*[=:]\s*)\S{4,}/gi, `$1${placeholder}`);

  result = result.replace(
    /([?&](?:api[_-]?key|token|access[_-]?token|secret|password|prompt|system_prompt|user_prompt)=)[^&\s]+/gi,
    `$1${placeholder}`
  );

  result = result.replace(
    /"(api[_-]?key|access[_-]?token|token|secret|password|prompt|system_prompt|user_prompt)"\s*:\s*"(?:[^"\\]|\\.)*"/gi,
    `"$1": "${placeholder}"`
  );

  return result;
}
