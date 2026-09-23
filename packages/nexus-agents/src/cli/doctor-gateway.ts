/**
 * The gateway half of `nexus-agents doctor` (#6609, epic #6612).
 *
 * Before this, doctor printed "✓ Voter transport: In-process gateway" from the
 * presence of two env vars, and its verdict counted only vendor API keys and
 * installed CLIs — so a host served entirely by a working gateway always
 * exited 1, and a host whose gateway was down could still print a check mark.
 *
 * {@link checkGatewayHealth} MEASURES the gateway with the calls the server
 * itself makes: the private-address guard (`checkGatewayHost`) and discovery
 * (`GET /models`, chat filter, allowlist). The completion probe is opt-in
 * because it spends tokens. {@link gatewayVerdict} turns the measurement into
 * the one term `isAllHealthy` and `failingVerdictTerms` read.
 *
 * Secrets: the key, the extra header values and the proxy URL's userinfo
 * never reach the result. Errors are redacted of the key and every header
 * value before they are stored.
 *
 * @module cli/doctor-gateway
 */

import type { IModelAdapter } from '../core/index.js';
import { getErrorMessage, getTimeProvider } from '../core/index.js';
import {
  createOpenAICompatAdapter,
  discoverGatewayCatalog,
  readOpenAICompatEnv,
  type OpenAICompatConfig,
} from '../adapters/openai-compat-adapter.js';
import { checkGatewayHost } from '../adapters/gateway-host-status.js';
import { gatewayProxyUrl } from '../adapters/gateway-http.js';
import {
  gatewayModelFamily,
  gatewaySlotMapping,
  type GatewayFamily,
  type GatewaySlotMapping,
} from '../adapters/gateway-family-slots.js';
import type { CliCheckResult } from './doctor.js';

/** Census buckets: the three slot families, and every model outside them. */
export type GatewayCensusBucket = GatewayFamily | 'unknown';

/**
 * Chat models per family. `unknown` counts every model not classified as one
 * of the three: an unrecognised vendor and a recognised fourth vendor alike.
 */
export type GatewayCensus = Readonly<Record<GatewayCensusBucket, number>>;

/**
 * How gateway calls leave the host. Never carries the proxy URL: it can hold
 * `user:password@`. `proxyHost` is host and port only.
 */
export type GatewayProxyStatus =
  | { readonly kind: 'direct' }
  | { readonly kind: 'proxy'; readonly proxyHost: string }
  /** A proxy variable is set, but `NO_PROXY` exempts the gateway host. */
  | { readonly kind: 'exempt' }
  /** A proxy variable is set but unusable (not http/https): calls go direct. */
  | { readonly kind: 'ignored' };

/** One family's completion probe. */
export type GatewayCompletionProbe =
  | { readonly family: GatewayFamily; readonly outcome: 'no_model' }
  | {
      readonly family: GatewayFamily;
      readonly outcome: 'ok' | 'failed';
      readonly model: string;
      readonly latencyMs: number;
      /** Redacted of the key and header values. Present when `failed`. */
      readonly error?: string;
    };

/** The measured gateway. Every state but `not_configured` names the host. */
export type GatewayHealth =
  | { readonly state: 'not_configured' }
  | {
      readonly state: 'refused_private_host';
      readonly host: string;
      readonly reason: string;
      readonly remedy: string;
      readonly proxy: GatewayProxyStatus;
    }
  | {
      /** `/models` failed: unreachable, refused, timed out, rejected the key, or over the cap. */
      readonly state: 'discovery_failed';
      readonly host: string;
      readonly error: string;
      readonly proxy: GatewayProxyStatus;
    }
  | {
      /** `/models` answered, but no model survived the chat filter and allowlist. */
      readonly state: 'no_chat_models';
      readonly host: string;
      readonly listedCount: number;
      readonly proxy: GatewayProxyStatus;
    }
  | {
      readonly state: 'healthy';
      readonly host: string;
      /** Rows `/models` returned, before the chat filter. */
      readonly listedCount: number;
      /** Chat models kept after the chat filter (and the allowlist, when set). */
      readonly chatCount: number;
      readonly allowlistActive: boolean;
      readonly census: GatewayCensus;
      readonly slots: GatewaySlotMapping;
      readonly proxy: GatewayProxyStatus;
      /** `skipped` unless the operator passed `--probe`. */
      readonly probes: readonly GatewayCompletionProbe[] | 'skipped';
    };

/** The verdict term: no gateway, a gateway that works, or one that does not. */
export type GatewayVerdict = 'absent' | 'pass' | 'fail';

const PROBE_FAMILIES: readonly GatewayFamily[] = ['anthropic', 'openai', 'google'];
const PROBE_SLOT: Readonly<Record<GatewayFamily, keyof GatewaySlotMapping>> = {
  anthropic: 'claude',
  openai: 'codex',
  google: 'gemini',
};
/** Room for a reasoning model to think and still answer one word. */
const PROBE_MAX_TOKENS = 256;
const PROBE_TIMEOUT_MS = 30_000;

export interface GatewayHealthOptions {
  /** Send one completion per family. Spends tokens; off unless `--probe`. */
  readonly probe?: boolean;
  /** Injectable for tests; defaults to the server's reader. */
  readonly config?: OpenAICompatConfig | null;
  readonly env?: NodeJS.ProcessEnv;
}

/** Measure the configured gateway. `not_configured` makes no network call. */
export async function checkGatewayHealth(
  options: GatewayHealthOptions = {}
): Promise<GatewayHealth> {
  const config = options.config !== undefined ? options.config : readOpenAICompatEnv();
  if (config === null) return { state: 'not_configured' };
  const env = options.env ?? process.env;
  const proxy = proxyStatus(config, env);
  const guard = await checkGatewayHost(config.baseUrl);
  if (guard.state === 'refused_private_host') {
    const { host, reason, remedy } = guard;
    return { state: 'refused_private_host', host, reason, remedy, proxy };
  }
  const host = guard.host;
  const discovered = await discoverGatewayCatalog(config);
  if (!discovered.ok) {
    return {
      state: 'discovery_failed',
      host,
      error: redact(discovered.error.message, config),
      proxy,
    };
  }
  const { listedCount, models } = discovered.value;
  if (models.length === 0) return { state: 'no_chat_models', host, listedCount, proxy };
  const adapters = models.map((m) => createOpenAICompatAdapter(m.id, config, m.created));
  const slots = gatewaySlotMapping(adapters, env);
  return {
    state: 'healthy',
    host,
    listedCount,
    chatCount: models.length,
    allowlistActive: (config.modelAllowlist ?? []).length > 0,
    census: censusOf(models.map((m) => m.id)),
    slots,
    proxy,
    probes: options.probe === true ? await probeFamilies(adapters, slots, config) : 'skipped',
  };
}

/** Chat models per family. */
function censusOf(ids: readonly string[]): GatewayCensus {
  const census: Record<GatewayCensusBucket, number> = {
    anthropic: 0,
    openai: 0,
    google: 0,
    unknown: 0,
  };
  for (const id of ids) {
    const family = gatewayModelFamily(id);
    const bucket = family === undefined || family === 'other' ? 'unknown' : family;
    census[bucket] += 1;
  }
  return census;
}

/** The proxy the gateway's calls use, told apart from its three look-alikes. */
function proxyStatus(config: OpenAICompatConfig, env: NodeJS.ProcessEnv): GatewayProxyStatus {
  if (config.proxyUrl !== undefined) return { kind: 'proxy', proxyHost: proxyHostOf(config) };
  if (gatewayProxyUrl(config.baseUrl, env) !== undefined) return { kind: 'ignored' };
  const withoutNoProxy = { ...env, no_proxy: undefined, NO_PROXY: undefined };
  if (gatewayProxyUrl(config.baseUrl, withoutNoProxy) !== undefined) return { kind: 'exempt' };
  return { kind: 'direct' };
}

function proxyHostOf(config: OpenAICompatConfig): string {
  try {
    return new URL(config.proxyUrl ?? '').host;
  } catch {
    return '<unparseable proxy>';
  }
}

/** One completion per family, in family order; a family with no model is not called. */
async function probeFamilies(
  adapters: readonly IModelAdapter[],
  slots: GatewaySlotMapping,
  config: OpenAICompatConfig
): Promise<readonly GatewayCompletionProbe[]> {
  const probes: GatewayCompletionProbe[] = [];
  for (const family of PROBE_FAMILIES) {
    const model = slots[PROBE_SLOT[family]];
    const adapter = adapters.find((a) => a.modelId === model);
    if (adapter === undefined) {
      probes.push({ family, outcome: 'no_model' });
      continue;
    }
    probes.push(await probeOne(family, adapter, config));
  }
  return probes;
}

async function probeOne(
  family: GatewayFamily,
  adapter: IModelAdapter,
  config: OpenAICompatConfig
): Promise<GatewayCompletionProbe> {
  const clock = getTimeProvider();
  const started = clock.now();
  const base = { family, model: adapter.modelId };
  try {
    const result = await adapter.complete({
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
      maxTokens: PROBE_MAX_TOKENS,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    const latencyMs = clock.now() - started;
    if (result.ok) return { ...base, outcome: 'ok', latencyMs };
    return { ...base, outcome: 'failed', latencyMs, error: redact(result.error.message, config) };
  } catch (e: unknown) {
    const latencyMs = clock.now() - started;
    return { ...base, outcome: 'failed', latencyMs, error: redact(getErrorMessage(e), config) };
  }
}

/** `message` with the key and every extra header value replaced. */
function redact(message: string, config: OpenAICompatConfig): string {
  const secrets = [config.apiKey, ...Object.values(config.extraHeaders ?? {})];
  return secrets
    .filter((s) => s !== '')
    .reduce((text, secret) => text.replaceAll(secret, '<redacted>'), message);
}

/**
 * The verdict term. A requested probe that failed fails the gateway: it was
 * asked whether the gateway serves, and it said no. A family with no model is
 * not a failure — the census reports it.
 */
export function gatewayVerdict(health: GatewayHealth): GatewayVerdict {
  if (health.state === 'not_configured') return 'absent';
  if (health.state !== 'healthy') return 'fail';
  const failed = health.probes !== 'skipped' && health.probes.some((p) => p.outcome === 'failed');
  return failed ? 'fail' : 'pass';
}

/** The gateway host for a verdict line, or undefined when none is configured. */
export function gatewayHostOf(health: GatewayHealth): string | undefined {
  return health.state === 'not_configured' ? undefined : health.host;
}

/**
 * Whether one CLI counts against the verdict. With a passing gateway a CLI
 * that is not installed does not: its slot is served by a gateway model of
 * its family. An installed CLI still has to be authenticated and supported.
 */
export function cliFailsVerdict(cli: CliCheckResult, gateway: GatewayVerdict): boolean {
  if (!cli.installed) return gateway !== 'pass';
  return !cli.authenticated || cli.versionStatus === 'unsupported';
}
