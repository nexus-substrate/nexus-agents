/**
 * nexus-agents/mcp/tools - CodePR Credential Redaction Helpers
 *
 * Helpers to redact tokens, authorization headers, and userinfo in URLs
 * from command strings, error messages, and stderr outputs.
 *
 * @module mcp/tools/codepr-credentials
 */

/**
 * Type guard for checking if an unknown value is an object containing a string property.
 */
export function hasStringProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, string> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    key in obj &&
    typeof (obj as Record<string, unknown>)[key] === 'string'
  );
}

/**
 * Redact sensitive credentials (tokens, base64 auth headers, userinfo in URLs) from
 * error messages, command strings, and stderr streams.
 */
export function redactCredentials(text: string, token?: string): string {
  if (text === '') return '';
  let result = text;
  if (token !== undefined && token.trim() !== '') {
    const trimmed = token.trim();
    result = result.split(trimmed).join('[REDACTED]');
    const base64Auth = Buffer.from(`x-access-token:${trimmed}`).toString('base64');
    result = result.split(base64Auth).join('[REDACTED]');
  }
  // Redact URL userinfo like https://user:pass@host or https://token@host
  result = result.replace(/https?:\/\/[^\s/@]+@[^\s/]+/g, (match) => {
    return match.replace(/https?:\/\/[^\s/@]+@/, 'https://[REDACTED]@');
  });
  // Redact Authorization headers if reflected
  result = result.replace(/(authorization:\s*bearer\s+)\S+/gi, '$1[REDACTED]');
  result = result.replace(/(authorization:\s*basic\s+)\S+/gi, '$1[REDACTED]');
  return result;
}
