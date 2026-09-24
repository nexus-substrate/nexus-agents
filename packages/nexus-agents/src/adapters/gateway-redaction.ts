/**
 * Redaction of gateway credentials from error text.
 *
 * A gateway request carries the key (in `Authorization: Bearer` or in the
 * header `NEXUS_OPENAI_COMPAT_AUTH_HEADER` names) and every static header
 * from `NEXUS_OPENAI_COMPAT_EXTRA_HEADERS`. A gateway's error body may echo
 * any of them, and none has a vendor shape the pattern sanitizer knows, so
 * each is removed by exact match. One helper, so the discovery path, the
 * per-model adapter and `doctor --gateway` cannot disagree on what is secret.
 *
 * @module adapters/gateway-redaction
 */

/** Replacement text for a redacted gateway credential. */
const GATEWAY_REDACTED = '<redacted>';

/** The credentials one gateway call site sends. */
export interface GatewaySecretSource {
  /** The gateway key — also the auth-header value when a custom header carries it. */
  readonly apiKey?: string | undefined;
  /**
   * Headers sent on every request. EVERY value is treated as secret; a
   * `null` value removes a default header and carries nothing.
   */
  readonly headers?: Readonly<Record<string, string | null>> | undefined;
}

/**
 * `message` with the key and every header value replaced by `placeholder`.
 * Blank values are skipped (`replaceAll('')` would interleave the marker
 * between every character). Longer values are replaced first, so a value
 * that contains another is removed whole rather than leaving its remainder.
 */
export function redactGatewaySecrets(
  message: string,
  source: GatewaySecretSource,
  placeholder: string = GATEWAY_REDACTED
): string {
  const secrets = [source.apiKey, ...Object.values(source.headers ?? {})]
    .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
    .sort((a, b) => b.length - a.length);
  return secrets.reduce((text, secret) => text.replaceAll(secret, placeholder), message);
}
