/**
 * Refuse a read-only codex run for an account codex would fetch cloud-managed
 * config for (#6977).
 *
 * {@link scanCodexMcpServers} refuses when `cloud-config-bundle-cache.json`
 * exists, but on a workspace account's first run nothing is cached yet: codex
 * fetches the bundle at startup, and an MCP server it defines starts outside
 * the read-only sandbox. Nothing on disk names those servers before the fetch.
 *
 * codex-cli 0.160.0 has no flag or config key that turns the fetch off
 * (`codex exec --help`, `codex features list`). Its gate is the account
 * alone, `cloud_config_eligible_auth` in `codex-rs/cloud-config/src/service.rs`
 * at tag `rust-v0.160.0`: a codex-backend auth mode whose plan is
 * business-like, education-like or enterprise. The plan is the
 * `chatgpt_plan_type` claim of the `id_token` in `$CODEX_HOME/auth.json`
 * (`CodexAuth::account_plan_type`), readable offline.
 *
 * This module allows only the personal plans and refuses everything else,
 * including team plans (a workspace account codex 0.160.0 does not fetch for)
 * and any plan it does not know, so a later codex that widens the gate is
 * refused rather than missed. Credentials that cannot be read here (a keyring
 * store, or an auth mode whose plan is not in the file) are refused too.
 *
 * No credential is read beyond the plan claim, and none reaches a message.
 */

import { join } from 'node:path';

import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import { isRecord } from '../utils/type-coercion.js';
import { readConfigIfPresent } from './mcp-config-scan.js';

/** Plans codex 0.160.0 never fetches cloud-managed config for. */
const PERSONAL_PLANS: ReadonlySet<string> = new Set([
  'free',
  'go',
  'plus',
  'pro',
  'prolite',
  'promax',
]);

/** Auth modes that never reach the codex backend, so never fetch the bundle. */
const NON_BACKEND_MODES: ReadonlySet<string> = new Set([
  'apikey',
  'bedrockApiKey',
  'bedrockAccessKeys',
]);

/** Auth modes whose plan is the `id_token` claim in auth.json. */
const ID_TOKEN_MODES: ReadonlySet<string> = new Set(['chatgpt', 'chatgptAuthTokens']);

/** The JWT claim namespace that carries `chatgpt_plan_type`. */
const AUTH_CLAIMS = 'https://api.openai.com/auth';

/** A plan value safe to echo: a plain identifier, never free text. */
const ECHOABLE_VALUE = /^[A-Za-z0-9_]{1,40}$/;

const REFUSAL_SUFFIX =
  'codex may fetch cloud-managed config whose MCP servers cannot be listed before the run';

/** Credential fields that select a mode when `auth_mode` is absent, in codex's order. */
const MODE_BY_FIELD: ReadonlyArray<readonly [string, string]> = [
  ['personal_access_token', 'personalAccessToken'],
  ['bedrock_api_key', 'bedrockApiKey'],
  ['bedrock_access_keys', 'bedrockAccessKeys'],
  ['OPENAI_API_KEY', 'apikey'],
];

/**
 * codex's `AuthDotJson::resolved_mode`: `auth_mode` when set, else the first
 * credential field present, else `chatgpt`. A non-string `auth_mode` is
 * `undefined`, which is refused.
 */
function resolvedMode(auth: Record<string, unknown>): string | undefined {
  const explicit = auth['auth_mode'];
  if (explicit !== undefined) return typeof explicit === 'string' ? explicit : undefined;
  const byField = MODE_BY_FIELD.find(
    ([field]) => auth[field] !== undefined && auth[field] !== null
  );
  return byField?.[1] ?? 'chatgpt';
}

/** The `chatgpt_plan_type` claim of `auth`'s id_token, or an error. */
function planClaim(auth: Record<string, unknown>): Result<string, string> {
  const tokens = auth['tokens'];
  const idToken = isRecord(tokens) ? tokens['id_token'] : undefined;
  if (typeof idToken !== 'string') return err('auth.json has no id_token to read the plan from');
  const payload = idToken.split('.')[1];
  let claims: unknown;
  try {
    claims =
      payload === undefined ? undefined : JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    claims = undefined;
  }
  const namespace = isRecord(claims) ? claims[AUTH_CLAIMS] : undefined;
  const plan = isRecord(namespace) ? namespace['chatgpt_plan_type'] : undefined;
  if (typeof plan !== 'string') return err('the auth.json id_token carries no account plan');
  return ok(plan);
}

/** A file value as it may appear in a message: echoed only when a plain identifier. */
function echoable(value: string | undefined): string {
  return value !== undefined && ECHOABLE_VALUE.test(value)
    ? JSON.stringify(value)
    : 'an unrecognized value';
}

/** auth.json parsed as an object, `undefined` when absent, or an error. */
function readAuth(codexHome: string): Result<Record<string, unknown> | undefined, string> {
  const path = join(codexHome, 'auth.json');
  const text = readConfigIfPresent(path);
  if (!text.ok) return text;
  if (text.value === undefined) return ok(undefined);
  let doc: unknown;
  try {
    doc = JSON.parse(text.value);
  } catch {
    return err(`cannot parse ${path}`);
  }
  return isRecord(doc) ? ok(doc) : err(`${path} is not a JSON object`);
}

/**
 * An error when the account in `codexHome` is one codex may fetch
 * cloud-managed config for, or cannot be classified offline.
 * `credentialsStore` is the `cli_auth_credentials_store` the child's config
 * sets; `undefined` is codex's default, `file`.
 */
export function cloudConfigAuthRefusal(
  codexHome: string,
  credentialsStore: string | undefined
): Result<undefined, string> {
  if (credentialsStore !== undefined && credentialsStore !== 'file') {
    return err(
      `cli_auth_credentials_store = ${echoable(credentialsStore)} keeps the account outside auth.json, so its plan cannot be checked; ${REFUSAL_SUFFIX}`
    );
  }
  const auth = readAuth(codexHome);
  if (!auth.ok) return err(`${auth.error}; ${REFUSAL_SUFFIX}`);
  // No auth.json under the file store: no ChatGPT login, so no fetch.
  if (auth.value === undefined) return ok(undefined);
  return accountRefusal(auth.value);
}

/** The refusal for one parsed auth.json: by auth mode, then by plan. */
function accountRefusal(auth: Record<string, unknown>): Result<undefined, string> {
  const mode = resolvedMode(auth);
  if (mode !== undefined && NON_BACKEND_MODES.has(mode)) return ok(undefined);
  if (mode === undefined || !ID_TOKEN_MODES.has(mode)) {
    return err(`codex auth_mode ${echoable(mode)} has no plan readable offline; ${REFUSAL_SUFFIX}`);
  }
  const plan = planClaim(auth);
  if (!plan.ok) return err(`${plan.error}; ${REFUSAL_SUFFIX}`);
  if (PERSONAL_PLANS.has(plan.value)) return ok(undefined);
  return err(
    `codex account plan ${echoable(plan.value)} is not a personal plan; ${REFUSAL_SUFFIX}`
  );
}
