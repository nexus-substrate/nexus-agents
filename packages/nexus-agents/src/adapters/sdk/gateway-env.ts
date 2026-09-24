/**
 * Env resolver for the single-model `custom-openai` gateway path (#4392
 * increment 3).
 *
 * Two mechanisms read an OpenAI-compatible gateway from the environment:
 *
 *   A. the single-model SDK path — `SdkAdapter({ providerId: 'custom-openai' })`
 *      via `auto-adapter.ts`, which mints the `api:custom-openai` routing arm
 *      under `NEXUS_BILLING_MODE=api`;
 *   B. the discovery path — `openai-compat-adapter.ts`, which lists the
 *      gateway's models, serves voters in-process and registers ONE
 *      `api:<endpoint>` arm.
 *
 * Both take a base URL and a key. Mechanism A historically read
 * `NEXUS_CUSTOM_API_BASE_URL` / `NEXUS_CUSTOM_API_KEY`; mechanism B reads
 * `NEXUS_OPENAI_COMPAT_URL` / `NEXUS_OPENAI_COMPAT_KEY`. This module makes the
 * old pair a deprecated ALIAS of the new pair for mechanism A only — a pure
 * rename shim, resolution `new ?? old` per variable (panel
 * vote-1789558437481-yup142p runoff, option C). Mechanism B is deliberately
 * NOT fed from the alias: renaming to the new names is what opts an operator
 * into the gateway path, and the deprecation warn says so. The aliases are
 * dropped in the next major (#6291).
 *
 * @module adapters/sdk/gateway-env
 */

import type { ILogger } from '../../core/index.js';
import { ConfigError, createLogger } from '../../core/index.js';
import {
  DEPRECATED_GATEWAY_ENV_ALIASES,
  OPENAI_COMPAT_KEY_ENV,
  OPENAI_COMPAT_URL_ENV,
} from './types.js';

/** One deprecated gateway env name found set in the environment. */
export interface DeprecatedGatewayEnvUse {
  readonly name: string;
  readonly replacement: string;
  /** True when the replacement is also set, so this alias is ignored. */
  readonly shadowed: boolean;
}

/** The resolved mechanism-A gateway pair plus every deprecated name in use. */
export interface GatewayEnv {
  /** `NEXUS_OPENAI_COMPAT_URL ?? NEXUS_CUSTOM_API_BASE_URL`, trimmed; empty is unset. */
  readonly baseUrl: string | undefined;
  /** `NEXUS_OPENAI_COMPAT_KEY ?? NEXUS_CUSTOM_API_KEY`, trimmed; empty is unset. */
  readonly apiKey: string | undefined;
  /** Deprecated names that are set, in table order — empty when none is. */
  readonly deprecated: readonly DeprecatedGatewayEnvUse[];
}

/** A set env value, trimmed; `undefined` for unset, empty, or whitespace-only. */
function readTrimmed(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

/**
 * Resolve the mechanism-A gateway pair from `env` (default `process.env`).
 * Pure: no logging, no once-guard. `readGatewayEnv` is the production entry;
 * this one serves the report surfaces (env-schema, doctor) that must not warn.
 */
export function resolveGatewayEnv(env: NodeJS.ProcessEnv = process.env): GatewayEnv {
  const deprecated: DeprecatedGatewayEnvUse[] = [];
  for (const alias of DEPRECATED_GATEWAY_ENV_ALIASES) {
    if (readTrimmed(env, alias.deprecated) === undefined) continue;
    deprecated.push({
      name: alias.deprecated,
      replacement: alias.replacement,
      shadowed: readTrimmed(env, alias.replacement) !== undefined,
    });
  }
  return {
    baseUrl: readWithAlias(env, OPENAI_COMPAT_URL_ENV),
    apiKey: readWithAlias(env, OPENAI_COMPAT_KEY_ENV),
    deprecated,
  };
}

/** `new ?? old` for one variable, the old spelling taken from the alias table. */
function readWithAlias(env: NodeJS.ProcessEnv, replacement: string): string | undefined {
  const current = readTrimmed(env, replacement);
  if (current !== undefined) return current;
  const alias = DEPRECATED_GATEWAY_ENV_ALIASES.find((a) => a.replacement === replacement);
  return alias === undefined ? undefined : readTrimmed(env, alias.deprecated);
}

const defaultLogger = createLogger({ component: 'gateway-env' });

/**
 * Once per process: a deprecated name is set, so the operator hears about it
 * exactly once, from whichever reader gets there first (or from server
 * startup). Names only — never a value.
 */
let deprecationWarned = false;

/** Test-only: re-arm the once-guard. */
export function _resetDeprecatedGatewayEnvWarning(): void {
  deprecationWarned = false;
}

/**
 * Emit the one deprecation warn if any deprecated gateway name is set and it
 * has not been emitted yet in this process. Safe to call from every reader;
 * the gateway bootstrap (`cli-server-gateway.ts` `tryWireGatewayAdapters`)
 * calls it at server startup so the line appears even when no reader of the
 * alias is reached (plan billing with a CLI available never consults
 * mechanism A).
 */
export function warnDeprecatedGatewayEnvOnce(
  env: NodeJS.ProcessEnv = process.env,
  logger: ILogger = defaultLogger
): void {
  if (deprecationWarned) return;
  const { deprecated } = resolveGatewayEnv(env);
  if (deprecated.length === 0) return;
  deprecationWarned = true;
  logger.warn(formatDeprecationWarning(deprecated));
}

/**
 * The warn line. Each name says whether it is honoured or ignored (shadowed
 * by its replacement), then the option-C consequence: these names configure
 * only the single-model `custom-openai` path, and the rename is the opt-in
 * to the gateway path. No value is ever interpolated — a URL can carry
 * userinfo and the key is the key.
 */
function formatDeprecationWarning(deprecated: readonly DeprecatedGatewayEnvUse[]): string {
  const uses = deprecated
    .map((d) =>
      d.shadowed
        ? `${d.name} (ignored: ${d.replacement} is set)`
        : `${d.name} (honoured; rename to ${d.replacement})`
    )
    .join('; ');
  return (
    `Deprecated gateway environment variable(s) set (#4392): ${uses}. ` +
    'These names configure only the single-model custom-openai path and stay aliases ' +
    'until the next major (#6291). Rename to NEXUS_OPENAI_COMPAT_* to opt into the ' +
    'gateway path (model discovery, in-process voter transport, api:<endpoint> arm).'
  );
}

/**
 * The production reader for mechanism A: resolve the pair and emit the
 * once-per-process deprecation warn when a deprecated name is set.
 */
export function readGatewayEnv(
  env: NodeJS.ProcessEnv = process.env,
  logger: ILogger = defaultLogger
): GatewayEnv {
  const resolved = resolveGatewayEnv(env);
  if (resolved.deprecated.length > 0) warnDeprecatedGatewayEnvOnce(env, logger);
  return resolved;
}

/**
 * The OpenAI API surface the single-model `custom-openai` path calls (#6645):
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
 * be any string, and a 401 body may echo the one it rejected. An empty key
 * matches nothing (`replaceAll('')` would interleave the marker).
 */
export function redactApiKey(message: string, apiKey: string | undefined): string {
  return apiKey === undefined || apiKey === '' ? message : message.replaceAll(apiKey, '<redacted>');
}
