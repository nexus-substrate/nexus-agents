/**
 * Canonical env resolver for the `custom-openai` gateway compatibility alias.
 *
 * The alias (`api:custom-openai`) and discovered arms (`api:<endpoint>`)
 * both read `NEXUS_OPENAI_COMPAT_URL` / `NEXUS_OPENAI_COMPAT_KEY`.
 *
 * @module adapters/sdk/gateway-env
 */

import { ConfigError } from '../../core/index.js';
import { OPENAI_COMPAT_KEY_ENV, OPENAI_COMPAT_URL_ENV } from './types.js';
import { redactGatewaySecrets } from '../gateway-redaction.js';

/** The resolved canonical gateway pair. */
export interface GatewayEnv {
  /** `NEXUS_OPENAI_COMPAT_URL`, trimmed; empty is unset. */
  readonly baseUrl: string | undefined;
  /** `NEXUS_OPENAI_COMPAT_KEY`, trimmed; empty is unset. */
  readonly apiKey: string | undefined;
}

/** A set env value, trimmed; `undefined` for unset, empty, or whitespace-only. */
function readTrimmed(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

/** Resolve the canonical gateway pair without logging. */
export function resolveGatewayEnv(env: NodeJS.ProcessEnv = process.env): GatewayEnv {
  return {
    baseUrl: readTrimmed(env, OPENAI_COMPAT_URL_ENV),
    apiKey: readTrimmed(env, OPENAI_COMPAT_KEY_ENV),
  };
}

/** The production reader for the canonical gateway pair. */
export function readGatewayEnv(env: NodeJS.ProcessEnv = process.env): GatewayEnv {
  return resolveGatewayEnv(env);
}

/**
 * The OpenAI API surface gateway adapters and the custom-openai alias call:
 * `chat` is `POST <base>/chat/completions`, `responses` is `POST <base>/responses`.
 */
type CustomApiSurface = 'chat' | 'responses';

const CUSTOM_API_SURFACE_ENV = 'NEXUS_CUSTOM_API_SURFACE';

/**
 * Read `NEXUS_CUSTOM_API_SURFACE` (#6645). Unset or empty means `chat`: the
 * AI SDK's default is the Responses API, but OpenAI-spec gateways commonly
 * serve `/chat/completions` only, so `responses` is the opt-in. Any other
 * value throws a `ConfigError` rather than guessing a surface.
 */
export function readCustomApiSurface(env: NodeJS.ProcessEnv = process.env): CustomApiSurface {
  const raw = env[CUSTOM_API_SURFACE_ENV]?.trim().toLowerCase() ?? '';
  if (raw === '' || raw === 'chat') return 'chat';
  if (raw === 'responses') return 'responses';
  throw new ConfigError(
    `${CUSTOM_API_SURFACE_ENV} must be one of: responses, chat (default chat); got an unrecognised value`
  );
}

/** Read by `@ai-sdk/openai` itself; the direct OpenAI adapter never passes a baseURL. */
const OPENAI_BASE_URL_ENV = 'OPENAI_BASE_URL';
const OPENAI_API_HOST = 'api.openai.com';

/**
 * The surface the direct OpenAI adapter (`OPENAI_API_KEY`) calls (#6654).
 * `undefined` means the provider's own default (the Responses API), exactly
 * as before: `OPENAI_BASE_URL` unset, blank, or naming `api.openai.com`, and
 * `NEXUS_CUSTOM_API_SURFACE` is then not read at all. Any other host is an
 * OpenAI-compatible gateway, so it gets {@link readCustomApiSurface}'s answer:
 * chat completions unless `NEXUS_CUSTOM_API_SURFACE=responses`.
 */
export function readDirectOpenAiSurface(
  env: NodeJS.ProcessEnv = process.env
): CustomApiSurface | undefined {
  const baseUrl = env[OPENAI_BASE_URL_ENV]?.trim() ?? '';
  if (baseUrl === '' || hostnameOf(baseUrl) === OPENAI_API_HOST) return undefined;
  return readCustomApiSurface(env);
}

/**
 * The host of a gateway base URL, for log lines and error messages. A base
 * URL can carry userinfo (`https://user:key@host/v1`), so the full string
 * must never reach a log. Two failure shapes, both replaced rather than
 * echoed: a string that does not parse at all, and a scheme-less paste such
 * as `key@host/v1`, which WHATWG parses with `key:` as the SCHEME and an
 * empty hostname (measured: `new URL('u:pw@host/v1').hostname === ''`).
 */
export function hostnameOf(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname;
    return host === '' ? '<no host>' : host;
  } catch {
    return '<unparseable url>';
  }
}

/**
 * Every exact occurrence of `apiKey` in `message` replaced with `<redacted>`.
 * The pattern-based sanitizer only knows vendor key shapes; a gateway key can
 * be any string, and a 401 body may echo the one it rejected. A blank key
 * matches nothing. The key-only case of {@link redactGatewaySecrets}.
 */
export function redactApiKey(message: string, apiKey: string | undefined): string {
  return redactGatewaySecrets(message, { apiKey });
}
