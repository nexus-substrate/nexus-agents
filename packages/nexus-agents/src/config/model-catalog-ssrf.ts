/**
 * SSRF validation and payload bounds for catalog fetch (#7072).
 *
 * Increment C of Epic #4391.
 *
 * @module config/model-catalog-ssrf
 */

export const MAX_CATALOG_PAYLOAD_BYTES = 25 * 1024 * 1024; // 25 MiB

export type UrlValidationResult =
  { readonly ok: true; readonly url: URL } | { readonly ok: false; readonly error: string };

const PRIVATE_IPV4_PATTERNS = [
  /^127\./, // Loopback
  /^10\./, // Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B
  /^192\.168\./, // Class C
  /^169\.254\./, // Link-local
  /^0\./, // Current network
];

function isPrivateIpHost(hostname: string): boolean {
  if (hostname === 'localhost') return true;
  for (const pattern of PRIVATE_IPV4_PATTERNS) {
    if (pattern.test(hostname)) return true;
  }
  const cleanIpv6 = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (cleanIpv6.startsWith('::ffff:')) {
    const mappedIpv4 = cleanIpv6.slice(7);
    for (const pattern of PRIVATE_IPV4_PATTERNS) {
      if (pattern.test(mappedIpv4)) return true;
    }
  }
  return (
    cleanIpv6 === '::1' ||
    cleanIpv6.startsWith('fc') ||
    cleanIpv6.startsWith('fd') ||
    cleanIpv6.startsWith('fe80')
  );
}

/** Validate URL for catalog fetching against SSRF risks. */
export function validateCatalogFetchUrl(
  inputUrl: string,
  allowedHostnames: readonly string[] = ['models.dev']
): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    return { ok: false, error: 'Invalid URL string' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, error: `Refused non-HTTPS protocol: ${parsed.protocol}` };
  }

  if (parsed.username !== '' || parsed.password !== '') {
    return { ok: false, error: 'Refused embedded credentials in catalog URL' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isPrivateIpHost(hostname)) {
    return { ok: false, error: `Refused private or loopback IP host: ${hostname}` };
  }

  const isAllowedHost = allowedHostnames.some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
  );
  if (!isAllowedHost) {
    return { ok: false, error: `Hostname ${hostname} is not in the allowed host list` };
  }

  return { ok: true, url: parsed };
}

/** Validate catalog payload size against payload ceiling. */
export function validateCatalogPayloadSize(
  byteLength: number,
  maxBytes: number = MAX_CATALOG_PAYLOAD_BYTES
): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  if (byteLength > maxBytes) {
    return {
      ok: false,
      error: `Oversized catalog payload: ${String(byteLength)} bytes exceeds maximum ${String(maxBytes)} bytes`,
    };
  }
  return { ok: true };
}
