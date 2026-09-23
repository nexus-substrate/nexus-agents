/**
 * Corporate-network transport for in-process OpenAI-compatible gateway calls
 * (#6608): which header carries the key, extra static headers, and the proxy.
 *
 * Applies to the gateway path — model discovery and every per-model
 * completion built by `openai-compat-adapter.ts` — and to the single-model
 * `custom-openai` path (`sdk/sdk-adapter.ts`, #6629), which reads the same
 * gateway URL and key. Other in-process SDK clients (the direct vendor
 * adapters) are untouched.
 *
 * **Proxy — measured, not assumed.** On Node 22.22.3, neither the global
 * `fetch` nor the `openai` SDK (which calls it) honours `HTTP_PROXY` /
 * `HTTPS_PROXY` / `NO_PROXY` unless the process was STARTED with
 * `NODE_USE_ENV_PROXY=1` (a loopback proxy saw no request without it, and
 * CONNECT tunnels with it). The engines floor is 22.5, which predates that
 * variable, so the gateway gets an explicit undici `ProxyAgent` instead,
 * selected here from the standard variables.
 *
 * **Secrets.** The key, header values and the proxy URL (which can carry
 * `user:password@`) never reach a log line: warnings name the variable and
 * the reason only.
 *
 * @module adapters/gateway-http
 */

import { ProxyAgent } from 'undici';
import type { ILogger } from '../core/index.js';
import type { OpenAIAdapterConfig } from './openai-types.js';

/** Header that carries the gateway key instead of `Authorization: Bearer`. */
const OPENAI_COMPAT_AUTH_HEADER_ENV = 'NEXUS_OPENAI_COMPAT_AUTH_HEADER';
/** Extra static headers sent on every gateway request: `Name=value,Name2=value2`. */
const OPENAI_COMPAT_EXTRA_HEADERS_ENV = 'NEXUS_OPENAI_COMPAT_EXTRA_HEADERS';

/** RFC 9110 `token`: the only legal header-name characters. */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
/** Control characters (CR/LF included) are never legal in a header value. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Transport options resolved from the environment for one gateway base URL. */
export interface GatewayTransport {
  /** Header carrying the key; absent means the SDK default, `Authorization: Bearer`. */
  readonly authHeader?: string;
  /** Static headers added to every request; absent means none. */
  readonly extraHeaders?: Readonly<Record<string, string>>;
  /** Proxy for the gateway's scheme, after `NO_PROXY`; absent means direct. */
  readonly proxyUrl?: string;
}

export type ExtraHeadersParse =
  | { readonly ok: true; readonly headers: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly reason: string };

/**
 * Parse `Name=value,Name2=value2`. Whitespace around names, values and
 * entries is trimmed; an empty entry (a trailing comma) is skipped. The whole
 * value is refused — not partially applied — on a newline or other control
 * character, an entry without `=`, an illegal or duplicate name, or an
 * `Authorization` entry (the key has exactly one place: the auth header
 * option). Reasons never quote a value.
 */
export function parseGatewayExtraHeaders(raw: string | undefined): ExtraHeadersParse {
  const headers: Record<string, string> = {};
  // Unset or blank is the named empty case: no extra headers, not an error.
  if (raw === undefined || raw.trim() === '') return { ok: true, headers };
  if (/[\r\n]/.test(raw)) return { ok: false, reason: 'contains a newline' };
  const seen = new Set<string>();
  for (const [index, entry] of raw.split(',').entries()) {
    if (entry.trim() === '') continue;
    const at = `entry ${String(index + 1)}`;
    const parsed = parseHeaderEntry(entry, at);
    if ('reason' in parsed) return { ok: false, reason: parsed.reason };
    const key = parsed.name.toLowerCase();
    if (seen.has(key)) return { ok: false, reason: `${at} is a duplicate header name` };
    seen.add(key);
    headers[parsed.name] = parsed.value;
  }
  return { ok: true, headers };
}

/** One `Name=value` entry, or why it is refused (`at` locates it, never quoting it). */
function parseHeaderEntry(
  entry: string,
  at: string
): { readonly name: string; readonly value: string } | { readonly reason: string } {
  const eq = entry.indexOf('=');
  if (eq < 0) return { reason: `${at} has no '='` };
  const name = entry.slice(0, eq).trim();
  const value = entry.slice(eq + 1).trim();
  if (!HEADER_NAME.test(name)) return { reason: `${at} has an illegal header name` };
  if (CONTROL_CHARS.test(value)) return { reason: `${at} value contains a control character` };
  if (name.toLowerCase() === 'authorization') {
    return { reason: `${at} sets Authorization; use ${OPENAI_COMPAT_AUTH_HEADER_ENV}` };
  }
  return { name, value };
}

/**
 * The reason `raw` cannot name the auth header, or `undefined` when it can.
 * `Authorization` itself is legal and means the default bearer scheme.
 */
function authHeaderRejection(raw: string): string | undefined {
  return HEADER_NAME.test(raw) ? undefined : 'not a legal header name';
}

/** First non-empty value among `names`, trimmed. */
function firstSet(env: NodeJS.ProcessEnv, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

/** Split a `NO_PROXY` entry into host and optional port (`[v6]:port` aware). */
function splitNoProxyEntry(entry: string): { host: string; port: string | undefined } {
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(entry);
  if (bracketed !== null) return { host: bracketed[1] ?? '', port: bracketed[2] };
  const parts = entry.split(':');
  if (parts.length === 2 && /^\d+$/.test(parts[1] ?? '')) {
    return { host: parts[0] ?? '', port: parts[1] };
  }
  return { host: entry, port: undefined };
}

/**
 * Curl-style `NO_PROXY` match: `*` matches everything; an entry matches the
 * host itself and its subdomains (a leading `.` or `*.` is optional); an entry
 * with a port matches that port only.
 */
function matchesNoProxy(url: URL, noProxy: string): boolean {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const port = url.port !== '' ? url.port : url.protocol === 'https:' ? '443' : '80';
  // No entries exempt nothing: an empty list means "proxy everything".
  return noProxy
    .split(/[\s,]+/)
    .some((raw) => noProxyEntryMatches(raw.trim().toLowerCase(), host, port));
}

/** One lowercased `NO_PROXY` entry against a host and its effective port. */
function noProxyEntryMatches(entry: string, host: string, port: string): boolean {
  if (entry === '') return false;
  if (entry === '*') return true;
  const parsed = splitNoProxyEntry(entry);
  if (parsed.port !== undefined && parsed.port !== port) return false;
  const suffix = parsed.host.replace(/^\*?\./, '');
  return suffix !== '' && (host === suffix || host.endsWith(`.${suffix}`));
}

/**
 * The proxy URL a request to `baseUrl` should use, or `undefined` for direct.
 * `https:` reads `https_proxy` then `HTTPS_PROXY`; `http:` reads `http_proxy`
 * then `HTTP_PROXY` (undici's order); `no_proxy` / `NO_PROXY` exempt a host.
 * Not validated here — {@link readGatewayTransport} does that.
 */
export function gatewayProxyUrl(baseUrl: string, env: NodeJS.ProcessEnv): string | undefined {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return undefined;
  }
  const names =
    url.protocol === 'https:'
      ? ['https_proxy', 'HTTPS_PROXY']
      : url.protocol === 'http:'
        ? ['http_proxy', 'HTTP_PROXY']
        : [];
  const proxy = firstSet(env, names);
  if (proxy === undefined) return undefined;
  const noProxy = firstSet(env, ['no_proxy', 'NO_PROXY']);
  return noProxy !== undefined && matchesNoProxy(url, noProxy) ? undefined : proxy;
}

/** Why `proxy` cannot be used, or `undefined` when it can. */
function proxyRejection(proxy: string): string | undefined {
  try {
    const { protocol } = new URL(proxy);
    return protocol === 'http:' || protocol === 'https:'
      ? undefined
      : 'only http:// and https:// proxies are supported';
  } catch {
    return 'not a valid URL';
  }
}

/** The auth header option, validated; `undefined` means the bearer default. */
function readAuthHeader(env: NodeJS.ProcessEnv, logger: ILogger): string | undefined {
  const raw = env[OPENAI_COMPAT_AUTH_HEADER_ENV]?.trim();
  if (raw === undefined || raw === '') return undefined;
  const reason = authHeaderRejection(raw);
  if (reason !== undefined) {
    logger.warn(
      `${OPENAI_COMPAT_AUTH_HEADER_ENV} ignored (${reason}); the key is sent as a bearer token`,
      {
        env: OPENAI_COMPAT_AUTH_HEADER_ENV,
        reason,
      }
    );
    return undefined;
  }
  return raw.toLowerCase() === 'authorization' ? undefined : raw;
}

/** The extra headers, validated against the auth header too; `undefined` means none. */
function readExtraHeaders(
  env: NodeJS.ProcessEnv,
  authHeader: string | undefined,
  logger: ILogger
): Readonly<Record<string, string>> | undefined {
  const parsed = parseGatewayExtraHeaders(env[OPENAI_COMPAT_EXTRA_HEADERS_ENV]);
  let reason = parsed.ok ? undefined : parsed.reason;
  if (parsed.ok && authHeader !== undefined) {
    const clash = Object.keys(parsed.headers).some(
      (name) => name.toLowerCase() === authHeader.toLowerCase()
    );
    if (clash) reason = `sets ${OPENAI_COMPAT_AUTH_HEADER_ENV}'s header, which carries the key`;
  }
  if (reason !== undefined) {
    logger.warn(
      `${OPENAI_COMPAT_EXTRA_HEADERS_ENV} ignored (${reason}); no extra headers are sent`,
      {
        env: OPENAI_COMPAT_EXTRA_HEADERS_ENV,
        reason,
      }
    );
    return undefined;
  }
  return parsed.ok && Object.keys(parsed.headers).length > 0 ? parsed.headers : undefined;
}

/** The proxy for `baseUrl`, validated; `undefined` means direct. */
function readProxy(baseUrl: string, env: NodeJS.ProcessEnv, logger: ILogger): string | undefined {
  const proxy = gatewayProxyUrl(baseUrl, env);
  if (proxy === undefined) return undefined;
  const reason = proxyRejection(proxy);
  if (reason === undefined) return proxy;
  const variable = baseUrl.startsWith('https:') ? 'HTTPS_PROXY' : 'HTTP_PROXY';
  logger.warn(`${variable} ignored for the gateway (${reason}); gateway calls go direct`, {
    env: variable,
    reason,
  });
  return undefined;
}

/**
 * Resolve the gateway's transport options from `env`. Every invalid input is
 * warned (variable + reason, never the value) and dropped, so the gateway
 * falls back to the default for that one option.
 */
export function readGatewayTransport(
  baseUrl: string,
  env: NodeJS.ProcessEnv,
  logger: ILogger
): GatewayTransport {
  const authHeader = readAuthHeader(env, logger);
  const extraHeaders = readExtraHeaders(env, authHeader, logger);
  const proxyUrl = readProxy(baseUrl, env, logger);
  return {
    ...(authHeader !== undefined && { authHeader }),
    ...(extraHeaders !== undefined && { extraHeaders }),
    ...(proxyUrl !== undefined && { proxyUrl }),
  };
}

/** One agent per proxy URL: a gateway builds an adapter per model. */
const proxyAgents = new Map<string, ProxyAgent>();

/**
 * The runtime's `RequestInit.dispatcher`, as `@types/node` declares it. The
 * agent comes from the `undici` package (major 6, the one Node 22 bundles),
 * whose types differ from the `undici-types` major that `@types/node` pins
 * only in optional-property spelling; the object is the dispatcher `fetch`
 * accepts at runtime, which the gateway proxy test exercises end to end.
 */
type FetchDispatcher = NonNullable<RequestInit['dispatcher']>;

function proxyAgentFor(proxyUrl: string): FetchDispatcher {
  const existing = proxyAgents.get(proxyUrl);
  const agent = existing ?? new ProxyAgent(proxyUrl);
  if (existing === undefined) proxyAgents.set(proxyUrl, agent);
  return agent as unknown as FetchDispatcher;
}

/** The `openai` client options a gateway transport contributes. */
export type GatewayClientOptions = Pick<OpenAIAdapterConfig, 'defaultHeaders' | 'fetchOptions'>;

/**
 * Client options for one gateway call site (discovery or a model adapter).
 * With an auth header, the SDK's bearer is removed (`Authorization: null` is
 * the SDK's documented removal) and the key goes in that header instead.
 * Returns only the keys that apply, so a default transport adds nothing.
 */
export function gatewayClientOptions(
  transport: GatewayTransport & { readonly apiKey: string }
): GatewayClientOptions {
  const headers = gatewayHeaders(transport);
  return {
    ...(Object.keys(headers).length > 0 && { defaultHeaders: headers }),
    ...(transport.proxyUrl !== undefined && {
      fetchOptions: { dispatcher: proxyAgentFor(transport.proxyUrl) },
    }),
  };
}

/**
 * The headers a transport adds: the extra headers, and with an auth header,
 * the key in that header and `Authorization: null` (both clients drop a
 * null-valued header, which removes their default bearer).
 */
function gatewayHeaders(
  transport: GatewayTransport & { readonly apiKey: string }
): Record<string, string | null> {
  const headers: Record<string, string | null> = { ...transport.extraHeaders };
  if (transport.authHeader !== undefined) {
    headers['Authorization'] = null;
    headers[transport.authHeader] = transport.apiKey;
  }
  return headers;
}

/** The AI-SDK `createOpenAI` settings a gateway transport contributes. */
interface GatewayAiSdkOptions {
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly fetch?: typeof fetch;
}

/**
 * The same transport as {@link gatewayClientOptions}, shaped for the AI-SDK
 * `createOpenAI` factory the single-model `custom-openai` path uses (#6629):
 * `headers` (a removed header is `undefined`, the AI SDK's spelling) and a
 * `fetch` that carries the proxy dispatcher. Only the keys that apply.
 */
export function gatewayAiSdkOptions(
  transport: GatewayTransport & { readonly apiKey: string }
): GatewayAiSdkOptions {
  const headers = Object.fromEntries(
    Object.entries(gatewayHeaders(transport)).map(([name, value]) => [name, value ?? undefined])
  );
  const proxyUrl = transport.proxyUrl;
  return {
    ...(Object.keys(headers).length > 0 && { headers }),
    ...(proxyUrl !== undefined && {
      fetch: (input: string | URL | Request, init?: RequestInit) =>
        fetch(input, { ...init, dispatcher: proxyAgentFor(proxyUrl) }),
    }),
  };
}
