/**
 * opencode.json gateway-config bridge (#2503, child 3 of epic #2500).
 *
 * When nexus-agents runs as an MCP loaded by OpenCode (typically inside a
 * Docker sandbox), OpenCode's `opencode.json` already declares the
 * OpenAI-compatible gateway the harness uses. Reading it from there saves
 * the operator from re-declaring the same `baseURL` + `apiKey` as
 * NEXUS_OPENAI_COMPAT_* env vars.
 *
 * Scope (per direction discussion 2026-05-09):
 *   - **Only** reads `providers.openai-compat.options.{baseURL, apiKey}`.
 *     Does NOT read OpenCode's MCP config, model list, logging, or other
 *     settings. nexus-agents' own behaviour stays driven by
 *     `nexus-agents.yaml` + `NEXUS_*` env vars.
 *   - Resolves OpenCode's `{env:VAR}` interpolation in the apiKey field.
 *   - Returns `null` on any failure path (missing file, parse error,
 *     missing fields, unset interpolated env var) — caller falls back to
 *     env-var precedence; we don't throw.
 *
 * Precedence (applied in `openai-compat-adapter.ts`):
 *   1. `NEXUS_OPENAI_COMPAT_URL` + `NEXUS_OPENAI_COMPAT_KEY` env vars (if both set)
 *   2. `NEXUS_OPENCODE_CONFIG` → `opencode.json` → `providers.openai-compat`
 *   3. Unconfigured → `null`, no adapter registered
 *
 * Sanitised logging: never log the resolved apiKey. Only the baseURL is
 * logged on success.
 *
 * @module config/opencode-bridge
 */

import { readFileSync } from 'node:fs';

import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'opencode-bridge' });

export interface OpencodeGatewayConfig {
  readonly baseURL: string;
  readonly apiKey: string;
}

/**
 * Read `providers.openai-compat.options.{baseURL, apiKey}` from the given
 * opencode.json path. Returns `null` on any failure — the caller falls
 * back to env-var precedence.
 */
export function readOpencodeGateway(path: string): OpencodeGatewayConfig | null {
  const raw = readFileOrNull(path);
  if (raw === null) return null;

  const parsed = parseJsonOrNull(raw, path);
  if (parsed === null) return null;

  const options = extractOpenAICompatOptions(parsed);
  if (options === null) {
    logger.debug('opencode.json has no providers.openai-compat.options block', { path });
    return null;
  }

  const baseURL = typeof options.baseURL === 'string' ? options.baseURL.trim() : '';
  const apiKeyRaw = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  if (baseURL === '' || apiKeyRaw === '') {
    logger.warn('opencode.json providers.openai-compat missing baseURL or apiKey', { path });
    return null;
  }

  const apiKey = resolveEnvInterpolation(apiKeyRaw);
  if (apiKey === null) {
    logger.warn(
      'opencode.json apiKey references an env var that is not set; gateway not configured',
      { path }
    );
    return null;
  }

  logger.info('Gateway config sourced from opencode.json', { baseURL, path });
  return { baseURL, apiKey };
}

function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug('Could not read opencode.json', { path, error: msg });
    return null;
  }
}

function parseJsonOrNull(raw: string, path: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('opencode.json is not valid JSON; ignoring', { path, error: msg });
    return null;
  }
}

/**
 * Pull `providers.openai-compat.options` out of the parsed JSON without
 * coupling to a Zod schema. OpenCode's config has many keys we don't
 * care about; we only navigate to the one we need.
 */
function extractOpenAICompatOptions(
  parsed: unknown
): { baseURL?: unknown; apiKey?: unknown } | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const root = parsed as { providers?: unknown };
  const providers = root.providers;
  if (typeof providers !== 'object' || providers === null) return null;
  const provider = (providers as Record<string, unknown>)['openai-compat'];
  if (typeof provider !== 'object' || provider === null) return null;
  const options = (provider as { options?: unknown }).options;
  if (typeof options !== 'object' || options === null) return null;
  return options;
}

/**
 * Resolve OpenCode's `{env:VAR}` interpolation. Only the literal pattern
 * is supported (no shell expansion, no defaults). Returns the string as-is
 * when no interpolation is present; returns `null` when the referenced
 * env var is not set.
 */
function resolveEnvInterpolation(value: string): string | null {
  const match = /^\{env:([A-Z0-9_]+)\}$/.exec(value);
  if (match === null) return value;
  const envName = match[1];
  if (envName === undefined) return null;
  const resolved = process.env[envName];
  if (resolved === undefined || resolved === '') return null;
  return resolved;
}
