/**
 * nexus-agents/cli-adapters - Core Type Definitions
 *
 * Core CLI types: CliName, CliTransport, CliResponse, CliError, etc.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: docs/research/cli-integration-architecture.md)
 */

import { CLI_NAMES, type CliNameLiteral } from '../config/model-capabilities-types.js';
import { z } from 'zod';

/**
 * Supported CLI names.
 * Derived from canonical source: config/model-capabilities-types.ts CliNameLiteral
 */
export type CliName = CliNameLiteral;

/**
 * Runtime guard for {@link CliName}: true iff `value` is one of the four CLI
 * slots. The `CliName`-typed readers on the circuit-breaker registry and the
 * adapter registry are filtered views over arm-keyed maps (#6290 panel), and
 * this is the one predicate they filter on.
 */
export function isCliName(value: string): value is CliName {
  return (CLI_NAMES as readonly string[]).includes(value);
}

/**
 * API-vendor identifiers an `AdapterSelection{source:'api'}` reports (#3422).
 * Distinct from the four CLI slots: a direct vendor API and the same vendor's
 * CLI binary have different latency/failure profiles, so they must NOT share a
 * routing/bandit arm (would pollute the learned model).
 */
export type ApiVendor = 'anthropic' | 'openai' | 'google' | 'custom-openai';

/** Prefixed routing arm id for a direct-API adapter, e.g. `api:anthropic` (#3422). */
export type ApiArmId = `api:${ApiVendor}`;

/**
 * Zod schema for {@link ApiArmId}, so persisted records can validate an API arm
 * (#4400). Kept next to the type rather than in the outcome schema so the two
 * cannot drift as `ApiVendor` changes.
 */
export const ApiArmIdSchema = z.enum([
  'api:anthropic',
  'api:openai',
  'api:google',
  'api:custom-openai',
]);

/**
 * A LinUCB/routing arm id — either a canonical CLI slot or a distinct API arm
 * (#3317 step 1 / #3422). Confined to the router/bandit/outcome surface so the
 * exhaustive `Record<CliName, …>` maps elsewhere stay narrow and untouched.
 */
export type RoutingArmId = CliName | ApiArmId;

/** Build the routing arm id for an API vendor. */
export function apiArmId(vendor: ApiVendor): ApiArmId {
  return `api:${vendor}`;
}

/**
 * Map a routing arm id to its display CLI slot (#3422) — identity for CLI
 * slots, vendor→slot for API arms. Used where a feature is intrinsically
 * slot-level (e.g. ZeroRouter difficulty calibration) and must collapse the
 * distinct API arm to its attribution slot. The bandit keeps the distinct arm;
 * only slot-level surfaces collapse.
 */
export function routingArmDisplaySlot(armId: RoutingArmId): CliName {
  switch (armId) {
    case 'api:anthropic':
      return 'claude';
    case 'api:openai':
      return 'codex';
    case 'api:google':
      return 'gemini';
    case 'api:custom-openai':
      return 'opencode';
    default:
      return armId;
  }
}

/**
 * Endpoint-identity segment of an {@link EndpointArmId} (#4392): an
 * operator-named endpoint. Lowercase alphanumerics plus `.`, `_`, `-`; must
 * start alphanumeric; 1–64 chars. `:`, `/`, `@` and whitespace are excluded
 * ON PURPOSE so a base URL — and any userinfo credential inside one — can
 * never become an arm id, telemetry key or display string. The four
 * {@link ApiVendor} names all satisfy it, so every {@link ApiArmId} is also a
 * valid endpoint arm id.
 */
const API_ENDPOINT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * Routing arm id for a dynamically registered API endpoint (#4392 increment
 * 1): `api:` plus a validated endpoint identity — one arm per GATEWAY, so two
 * operator-named endpoints are distinct arms. Deliberately NOT a member of
 * {@link RoutingArmId} or of the persisted `OutcomeCli` union (#6290 panel):
 * an endpoint arm can be registered and observed (breaker, capacity,
 * telemetry key) but cannot enter an outcome record until #6291 widens the
 * published ids in 9.0. The type alone admits any `api:` string; the runtime
 * shape is enforced by {@link isEndpointArmId}, and a cast from an
 * unvalidated string is exactly what that validator exists to refuse.
 */
export type EndpointArmId = `api:${string}`;

/** Zod schema for {@link EndpointArmId}; the single source for {@link isEndpointArmId}. */
const EndpointArmIdSchema = z.templateLiteral(['api:', z.string().regex(API_ENDPOINT_ID_PATTERN)]);

/**
 * Runtime guard for {@link EndpointArmId} (#4392): true iff `value` is `api:`
 * plus a valid endpoint identity. Use it before a discovered or
 * operator-supplied name becomes an arm id. Every {@link ApiArmId} passes.
 */
export function isEndpointArmId(value: string): value is EndpointArmId {
  return EndpointArmIdSchema.safeParse(value).success;
}

/**
 * Every arm the circuit-breaker registry and the adapter registry can hold
 * (#4392 increment 1): a published {@link RoutingArmId} or a dynamically
 * registered {@link EndpointArmId}. This is the parameter type of the
 * arm-typed registry siblings (`getArmBreaker`, `getAdapterForArm`, …) and of
 * the `armId` fields on circuit events and errors. It is NOT the routing /
 * bandit / outcome arm type — that stays {@link RoutingArmId} until #6291.
 */
export type ObservedArmId = RoutingArmId | EndpointArmId;

/**
 * Display slot for an endpoint arm that is not one of the built-in API arms
 * (#4392). `opencode` is the slot whose capability profile describes an
 * OpenAI-compatible endpoint of unknown model family, and the slot the only
 * pre-existing gateway arm (`api:custom-openai`) already collapses to. The
 * breaker keeps the distinct arm; only slot-level surfaces see this collapse.
 */
const UNKNOWN_ENDPOINT_ARM_DISPLAY_SLOT: CliName = 'opencode';

/**
 * Runtime split of an {@link ObservedArmId}: true iff `value` is one of the
 * four built-in {@link ApiArmId} literals. Module-private on purpose — the
 * exhaustive switch in {@link routingArmDisplaySlot} is the type-level
 * contract, and this is only the guard that lets {@link observedArmDisplaySlot}
 * route to it.
 */
function isBuiltInApiArmId(value: string): value is ApiArmId {
  return ApiArmIdSchema.safeParse(value).success;
}

/**
 * Display slot for any observed arm (#4392): {@link routingArmDisplaySlot} for
 * a published {@link RoutingArmId}, and the explicit
 * {@link UNKNOWN_ENDPOINT_ARM_DISPLAY_SLOT} for every other endpoint arm.
 * Used by the breaker and the `cliName` fields on its events and errors, which
 * keep their `CliName` type (#6290 panel).
 */
export function observedArmDisplaySlot(armId: ObservedArmId): CliName {
  if (isCliName(armId) || isBuiltInApiArmId(armId)) {
    return routingArmDisplaySlot(armId);
  }
  return UNKNOWN_ENDPOINT_ARM_DISPLAY_SLOT;
}

/**
 * Transport type for CLI communication.
 * - 'mcp': Uses Model Context Protocol (most stable)
 * - 'subprocess': Spawns CLI process with JSON output
 */
export type CliTransport = 'mcp' | 'subprocess';

/**
 * Token usage information from CLI response — ONE call's usage as the CLI
 * parsers emit it.
 *
 * This is deliberately a separate type from the adapter response contract's
 * `TokenUsage` in `core/types/model.ts` (#4440): here `totalTokens` is
 * optional because not every CLI prints one, there it is required. The two
 * cross only in the two adapter bridges, and every crossing goes through
 * `token-usage-bridge.ts` so no field is narrowed silently.
 */
export interface TokenUsage {
  /** Input tokens consumed */
  readonly inputTokens: number;
  /** Output tokens generated */
  readonly outputTokens: number;
  /** Cached input tokens READ from an existing cache (if applicable). */
  readonly cachedInputTokens?: number;
  /**
   * Input tokens spent WRITING the cache, when the vendor reports them
   * separately (#4435). Kept distinct from {@link cachedInputTokens} because
   * they bill at opposite ends: cache writes are ~1.25x the uncached input
   * rate, cache reads ~0.1x. Collapsing them would make correct pricing
   * impossible.
   */
  readonly cacheCreationInputTokens?: number;
  /** Total tokens (input + output) */
  readonly totalTokens?: number;
  /**
   * Whether `inputTokens` is a measurement (#4835); `false` means it is a
   * placeholder `0` and `totalTokens` a lower bound. Absent means measured.
   *
   * No CLI parser sets this. It exists so the model→CLI bridge
   * (`toCliTokenUsage`, #4440) can carry a direct-API adapter's flag instead of
   * dropping it, which turned a placeholder count into a measured zero.
   */
  readonly inputTokensMeasured?: boolean;
}

/**
 * Unified CLI response format.
 * Normalized across all CLI output formats.
 */
export interface CliResponse {
  /** The response text */
  readonly text: string;
  /** Token usage statistics */
  readonly usage?: TokenUsage;
  /** Session ID for resumption */
  readonly sessionId?: string;
  /** Cost in USD (if available) */
  readonly costUsd?: number;
  /** Model used for generation */
  readonly model?: string;
  /**
   * The gateway arm that served this response, when a gateway model answered
   * it (#6624). Set by the model-to-CLI bridge from the model adapter's
   * gateway-arm marker. A telemetry writer prices the call by this arm's
   * `NEXUS_GATEWAY_COST` declaration, never by `model`'s list rate. Absent for
   * a CLI subprocess or a direct vendor API.
   */
  readonly gatewayArm?: EndpointArmId;
  /**
   * The model the caller asked for, when the adapter answered with a
   * different one from the same CLI family (#6120). Present only on a
   * substituted response — the claude adapter sets it after an
   * out-of-credits envelope for the requested model made it retry the next
   * registry alias — so a record consumer (#6115) can say which model
   * actually voted. Absent means the requested model answered.
   */
  readonly fallbackFrom?: string;
  /** Duration in milliseconds */
  readonly durationMs?: number;
  /**
   * CLI slot of the arm `CompositeRouter.executeTask` selected and ran (#6521).
   * Set only by the router, never by an adapter. CLI subprocess adapters report
   * no `model`, so without this a caller cannot attribute a routed outcome.
   * This is the DISPLAY slot: an `api:anthropic` run reads `claude` here. An
   * outcome record wants {@link routedArm}.
   */
  readonly routedCli?: CliName;
  /**
   * Routing arm id of the arm the router ran (#6552): `api:anthropic` for the
   * Anthropic API arm, `claude` for the claude CLI arm. Set only by the
   * router, alongside {@link routedCli}. This is what a persisted outcome's
   * `cli` records, so warm start credits the arm that ran, not its slot.
   */
  readonly routedArm?: RoutingArmId;
  /**
   * Wall time of the routed arm's `execute` call alone, in ms (#6521). Set only
   * by `CompositeRouter.executeTask`; excludes routing and caller overhead.
   */
  readonly routedDurationMs?: number;
  /** Raw response (for debugging) */
  readonly raw?: unknown;
  /**
   * Stderr the transport captured during a SUCCESSFUL call, when non-empty
   * (#6094). On the subprocess path this is the CLI's stderr; on the codex MCP
   * path it is what `codex mcp-server` wrote to its piped stderr while the tool
   * call was in flight. A sandbox failure inside the CLI's tool loop surfaces
   * here while `text` still carries a parsed answer. Absent on a clean run.
   */
  readonly stderr?: string;
}

/**
 * Error codes for CLI operations.
 */
export type CliErrorCode =
  | 'NOT_FOUND' // CLI not installed
  | 'NOT_AUTHENTICATED' // OAuth/auth required
  | 'RATE_LIMITED' // Rate limit exceeded
  | 'TIMEOUT' // Execution timed out
  | 'CANCELLED' // Execution cancelled by caller (#6691)
  | 'PARSE_ERROR' // Response parsing failed
  | 'CONNECTION_ERROR' // MCP connection failed
  | 'EXECUTION_ERROR' // CLI returned error
  | 'UNSUPPORTED_VERSION' // CLI version not supported
  | 'BUDGET_EXCEEDED' // Budget limit exceeded
  | 'UNKNOWN'; // Unknown error

/**
 * CLI execution error.
 */
export interface CliError {
  /** Error code */
  readonly code: CliErrorCode;
  /** Human-readable message */
  readonly message: string;
  /** CLI that produced the error */
  readonly cli: CliName;
  /** Underlying error (if any) */
  readonly cause?: Error;
  /** Whether the error is retryable */
  readonly retryable: boolean;
  /**
   * How long the provider asked us to wait before retrying, in milliseconds
   * (#4373). Present only when the CLI's own message stated one — parsed by
   * `parseRetryAfterMs`. The retry loop prefers this over its computed
   * exponential backoff, since a provider that names its window knows better
   * than our guess.
   */
  readonly retryAfterMs?: number;
  /**
   * CLI slot of the arm `CompositeRouter.executeTask` selected, when that arm
   * ran and failed (#6521). Set only by the router, so a caller can record
   * the failure against the arm it routed to. Absent when routing itself failed.
   * The display slot; see {@link CliResponse.routedArm} for the arm id.
   */
  readonly routedCli?: CliName;
  /** Routing arm id of the arm that ran and failed (#6552); see {@link CliResponse.routedArm}. */
  readonly routedArm?: RoutingArmId;
  /** Wall time of the failed arm's `execute` call alone, in ms (#6521). */
  readonly routedDurationMs?: number;
}

/**
 * Version compatibility status.
 */
export type VersionStatus = 'supported' | 'outdated' | 'breaking' | 'unsupported';

/**
 * Health check status for a CLI.
 */
export interface HealthStatus {
  /** Whether the CLI is healthy */
  readonly healthy: boolean;
  /** CLI version */
  readonly version: string;
  /** Version compatibility status */
  readonly versionStatus: VersionStatus;
  /** Optional message (e.g., upgrade recommendation) */
  readonly message?: string;
  /**
   * Whether the underlying CLI could be reached at all (#5060).
   *
   * `healthCheck` catches its own failures and returns rather than throwing, so
   * a `healthy: false` result covers two very different states: the binary ran
   * and reported an unsupported version, or the binary could not be run at all
   * (`spawn ENOENT`). Both arrive as `versionStatus: 'unsupported'`, and a
   * consumer reading only `healthy` told users to authenticate a CLI they had
   * not installed.
   *
   * Absent means the producer predates the distinction — unknown, not
   * unreachable. Consumers should treat `reachable !== false` as "present".
   */
  readonly reachable?: boolean;
  /**
   * When the evidence behind {@link reachable} was actually gathered (#5864).
   *
   * `BaseCliAdapter` caches the version string forever — no TTL, no reset, not
   * even on `dispose()` — so every `healthCheck` after the first for a given
   * instance returns without spawning anything. `reachable: true` then restates
   * a past observation as a present one, and `lastChecked` is stamped `now`,
   * which dates a replay as if it were a fresh probe.
   *
   * Compare the two: equal (to the probe) means this check ran the binary;
   * earlier means `reachable` rests on a cached reading and the binary may have
   * gone away since. Absent means the producer does not probe a binary at all
   * (an in-process adapter) or predates the distinction — unknown, not stale.
   */
  readonly versionProbedAt?: Date;
  /** Last successful health check */
  readonly lastChecked: Date;
}

/**
 * Capacity status for rate limiting.
 */
export interface CapacityStatus {
  /** Remaining tokens in current window */
  readonly remainingTokens: number;
  /** Remaining requests in current window */
  readonly remainingRequests: number;
  /** When the rate limit resets */
  readonly resetTime: Date;
  /** Current utilization percentage (0-100) */
  readonly utilizationPercent: number;
  /**
   * Whether this process's rolling rate window is used up (#4456).
   *
   * Local arithmetic only: this process's own spend over the last
   * {@link RATE_LIMIT_WINDOW_MS}, measured against a per-CLI constant the
   * source calls a conservative estimate. It self-clears within the window,
   * and an ordinary burst (a 7-voter panel, a subagent fan-out) sets it while
   * plenty of provider quota remains.
   *
   * This is a throttling hint, NOT evidence that the account is out of
   * capacity. Do not exclude a candidate on it — see {@link quotaExhausted}.
   */
  readonly rateLimited: boolean;
  /**
   * @deprecated Since #4456 — renamed to {@link rateLimited}, which says what
   * it actually measures. The name `exhausted` promised an account/plan
   * capacity signal while reporting a 60-second local rate heuristic, so every
   * reader inherited a claim the value could not support. Identical value;
   * scheduled for removal in the next major.
   */
  readonly exhausted: boolean;
  /**
   * Whether a PROVIDER asserted that durable quota is gone (#4456).
   *
   * Set only from provider-asserted evidence — a rate-limit error whose
   * `retry-after` exceeds the local window, which is the provider itself
   * saying the wait is longer than a per-minute throttle. Never inferred from
   * local counting.
   *
   * `false` means "no provider has asserted exhaustion to THIS process". It is
   * NOT a measurement that quota remains: a weekly quota burned by another
   * process is invisible here. Read it with {@link observed}; absence of
   * evidence must not be presented as capacity.
   */
  readonly quotaExhausted: boolean;
  /**
   * When the provider said the quota window clears, from `retry-after`.
   *
   * Present only alongside `quotaExhausted: true`. Absent means the provider
   * asserted exhaustion without a horizon, which is a weaker signal, not a
   * shorter one.
   */
  readonly quotaResetAt?: Date;
  /**
   * Whether this process has observed any usage of the adapter (#4374).
   *
   * When false, every other field is a *default*, not a measurement: a tracker
   * that has never recorded a request reports the full token limit remaining and
   * 0% utilization, which is indistinguishable from a genuinely idle adapter.
   * Consumers must not present an unobserved reading as health.
   *
   * Note the narrower guarantee even when true: the tracker sees only THIS
   * process's spend. It has no visibility into a provider-side weekly quota
   * consumed elsewhere, so `remainingTokens` is a local upper bound on what is
   * left, never an authoritative one.
   */
  readonly observed: boolean;
}
