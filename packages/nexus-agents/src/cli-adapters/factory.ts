/**
 * nexus-agents/cli-adapters - Adapter Factory
 *
 * Factory for creating CLI adapters based on configuration.
 * Supports optional caching of CLI health check results.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: Issue #90 - Codex MCP adapter)
 * (Source: Issue #165 - CLI detection cache)
 */

import type { ICliAdapter, CliName, RoutingArmId, CliTransport } from './types.js';
import { createLogger, getTimeProvider } from '../core/index.js';
import { collectApiRoutingArms } from '../adapters/auto-adapter.js';
import { ClaudeCliAdapter } from './adapters/claude-adapter.js';
import { GeminiCliAdapter } from './adapters/gemini-adapter.js';
import { CodexCliAdapter } from './adapters/codex-adapter.js';
import { CodexMcpAdapter } from './adapters/codex-mcp-adapter.js';
import { OpenCodeCliAdapter } from './adapters/opencode-adapter.js';
import type { ILogger } from '../core/index.js';
import type { ICliDetectionCache } from './cli-detection-cache.js';
import { CliDetectionCache } from './cli-detection-cache.js';
import { probeCli } from '../cli/cli-auth-probe.js';
import { getCliCircuitBreakerSnapshot } from './cli-circuit-breaker.js';
import { isCliDisabled } from './disabled-clis.js';
import {
  codexMcpServerAvailable,
  CodexMcpServerUnavailableError,
  CODEX_MCP_SERVER_UNAVAILABLE_REASON,
} from './codex-mcp-server-probe.js';

const factoryLogger = createLogger({ component: 'cli-adapter-factory' });

/**
 * Configuration for creating a CLI adapter.
 */
export interface CliAdapterConfig {
  /** Which CLI to use */
  readonly cli: CliName;
  /** Optional model override */
  readonly model?: string;
  /** Optional logger */
  readonly logger?: ILogger;
  /**
   * Transport for Codex: `'mcp'` or `'subprocess'`. Unset selects by probe
   * (#6119): `mcp` when the installed codex serves `mcp-server`, otherwise
   * `subprocess` (`codex exec`). An explicit `'mcp'` on a codex without the
   * subcommand throws {@link CodexMcpServerUnavailableError} at construction.
   */
  readonly transport?: CliTransport;
}

/**
 * Creates a CLI adapter based on configuration.
 *
 * @param config - Adapter configuration
 * @returns The configured CLI adapter
 * @throws Error if CLI name is not supported
 *
 * @example
 * ```typescript
 * const adapter = createCliAdapter({ cli: 'claude', model: 'claude-opus-4' });
 * const result = await adapter.execute({ content: 'Hello!' });
 * ```
 */
export function createCliAdapter(config: CliAdapterConfig): ICliAdapter {
  const options = {
    ...(config.model !== undefined && { model: config.model }),
    ...(config.logger !== undefined && { logger: config.logger }),
  };

  switch (config.cli) {
    case 'claude':
      return new ClaudeCliAdapter(options);

    case 'gemini':
      return new GeminiCliAdapter(options);

    case 'codex':
      return createCodexAdapter(config.transport, options);

    case 'opencode':
      return new OpenCodeCliAdapter(options);

    default: {
      const exhaustiveCheck: never = config.cli;
      throw new Error(`Unsupported CLI: ${String(exhaustiveCheck)}`);
    }
  }
}

/**
 * Creates a Codex adapter for the requested transport.
 *
 * The MCP transport was the default since #90. codex-cli 0.154 removed the
 * `mcp-server` subcommand it spawns (#6119), so an unset transport now follows
 * the probe: `mcp` only when the installed codex serves it, otherwise the
 * subprocess transport, which already carries the #6093 landlock flag and the
 * #6101 stderr capture. An explicit `'mcp'` that the probe refuses throws a
 * typed error naming the cause rather than spawning a process that dies with
 * `stdin is not a terminal`.
 *
 * @param transport - `'mcp'`, `'subprocess'`, or `undefined` to select by probe
 * @param options - Adapter options
 * @returns Codex CLI adapter
 * @throws CodexMcpServerUnavailableError when `'mcp'` is demanded but unavailable
 */
function createCodexAdapter(
  transport: CliTransport | undefined,
  options: { model?: string; logger?: ILogger }
): ICliAdapter {
  if (transport === 'subprocess') {
    return new CodexCliAdapter(options);
  }
  const mcpServerAvailable = codexMcpServerAvailable();
  if (transport === 'mcp') {
    if (!mcpServerAvailable) throw new CodexMcpServerUnavailableError();
    return new CodexMcpAdapter(options);
  }
  if (mcpServerAvailable) return new CodexMcpAdapter(options);
  (options.logger ?? factoryLogger).debug('Codex transport selected by probe: subprocess', {
    reason: CODEX_MCP_SERVER_UNAVAILABLE_REASON,
  });
  return new CodexCliAdapter(options);
}

/**
 * Creates all available routing-arm adapters.
 * Codex transport is selected by probe unless one is passed (#6119).
 *
 * The four CLI slots are registered under their slot key, except any disabled
 * by `NEXUS_DISABLED_CLIS` (#6590); every CLI disabled yields an empty map. When
 * `NEXUS_BILLING_MODE=api`, the direct-API adapters whose keys are present are
 * ALSO appended as distinct `api:<vendor>` routing arms (#3422) so the router /
 * bandit can score them separately from the CLI slots. DEFAULT (plan) mode
 * returns CLIs only — never surprise API spend. Key-presence-only and
 * deterministic; keys are never validated by calling out.
 *
 * @param logger - Optional shared logger
 * @param codexTransport - Transport for Codex; unset selects by probe
 * @returns Map of routing arm id to adapter
 */
export function createAllAdapters(
  logger?: ILogger,
  codexTransport?: CliTransport
): Map<RoutingArmId, ICliAdapter> {
  const adapters = new Map<RoutingArmId, ICliAdapter>();
  const options = logger !== undefined ? { logger } : undefined;

  const slots: ReadonlyArray<readonly [CliName, () => ICliAdapter]> = [
    ['claude', () => new ClaudeCliAdapter(options)],
    ['gemini', () => new GeminiCliAdapter(options)],
    ['codex', () => createCodexAdapter(codexTransport, options ?? {})],
    ['opencode', () => new OpenCodeCliAdapter(options)],
  ];
  // #6590: an operator-disabled CLI is not an arm. Skipped before
  // construction, so a disabled codex is not even probed for its transport.
  for (const [cli, create] of slots) {
    if (!isCliDisabled(cli)) adapters.set(cli, create());
  }

  // API arms enter the router only in explicit api billing mode (#3422).
  if (process.env['NEXUS_BILLING_MODE'] === 'api') {
    for (const { armId, adapter } of collectApiRoutingArms(logger)) {
      adapters.set(armId, adapter);
    }
  }

  return adapters;
}

/**
 * Checks if a CLI is available by running a health check.
 * Uses cache if provided to avoid repeated subprocess calls.
 *
 * @param cli - CLI name to check
 * @param cache - Optional cache to use
 * @returns True if CLI is healthy
 */
export async function isCliAvailable(cli: CliName, cache?: ICliDetectionCache): Promise<boolean> {
  // Check cache first
  if (cache !== undefined) {
    const cached = cache.get(cli);
    if (cached !== undefined) {
      return cached.healthy;
    }
  }

  try {
    const adapter = createCliAdapter({ cli });
    // Pre-#2725 only ran healthCheck() — which confirms the binary exists
    // and runs but does NOT probe authentication. Result: orchestrate listed
    // opencode as "Available" when the user wasn't logged in, and the next
    // call failed with an opaque subprocess error. Auth must agree with the
    // probe doctor already uses (cli-auth-probe.ts, #2447).
    const [health, auth] = await Promise.all([adapter.healthCheck(), probeCli(cli)]);
    // #4391: `unknown` is ADMITTED, not excluded. Some gateways expose no
    // auth signal we can read — agy has no non-interactive auth check at all,
    // and its `models` subcommand hangs without a TTY (#4393). Treating an
    // absence of evidence as a failure is what excluded a working agy arm from
    // routing (#4346); treating it as success is how the retired gemini CLI
    // stayed selectable while failing every call (#4318). We admit it and let
    // real invocation failures do the excluding, via the circuit breaker the
    // adapters now feed (#4330).
    const authBlocks = auth.state === 'needs-login' || auth.state === 'not-installed';
    const available = health.healthy && !authBlocks;

    // Store in cache if provided. Synthesize a degraded health record when
    // the binary is healthy but auth failed, so downstream consumers see
    // "unavailable" without losing the version string.
    if (cache !== undefined) {
      if (available) {
        cache.set(cli, CliDetectionCache.fromHealthStatus(health));
      } else {
        cache.set(cli, {
          healthy: false,
          version: health.version,
          versionStatus: health.versionStatus,
          checkedAt: new Date(),
          message: authBlocks
            ? `auth: ${auth.state}` + ('reason' in auth ? ` (${auth.reason})` : '')
            : health.message,
        });
      }
    }

    return available;
  } catch (error: unknown) {
    // Closes #2952 (medium): pre-fix the bare `catch {}` dropped the error
    // entirely — operators saw `<cli>: unavailable` with no way to tell
    // whether the binary was missing, the probe timed out, or some other
    // failure occurred. Now include the message in the cached entry.
    cacheHealthCheckFailure(cache, cli, error);
    return false;
  }
}

/** Records a health-check exception in the cache with the error message preserved. */
function cacheHealthCheckFailure(
  cache: ICliDetectionCache | undefined,
  cli: CliName,
  error: unknown
): void {
  if (cache === undefined) return;
  const message = error instanceof Error ? error.message : String(error);
  cache.set(cli, {
    healthy: false,
    version: 'unknown',
    versionStatus: 'unsupported',
    checkedAt: new Date(getTimeProvider().now()),
    message: `Health check failed: ${message}`,
  });
}

/**
 * Gets all available CLIs by running health checks.
 * Uses cache if provided to avoid repeated subprocess calls. CLIs disabled by
 * `NEXUS_DISABLED_CLIS` are excluded (#6590); disabling every CLI yields `[]`.
 *
 * @param cache - Optional cache to use
 * @returns Array of available CLI names
 */
export async function getAvailableClis(cache?: ICliDetectionCache): Promise<CliName[]> {
  // #6590: disabled CLIs are dropped before probing, so none spends a probe.
  const clis = (['claude', 'gemini', 'codex', 'opencode'] as const).filter(
    (cli) => !isCliDisabled(cli)
  );

  // Check all CLIs in parallel to avoid sequential timeout penalties
  const results = await Promise.allSettled(
    clis.map(async (cli) => ({ cli, available: await isCliAvailable(cli, cache) }))
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<{ cli: CliName; available: boolean }> =>
        r.status === 'fulfilled' && r.value.available
    )
    .filter((r) => isCliServingForVoters(r.value.cli))
    .map((r) => r.value.cli);
}

function isCliServingForVoters(cli: CliName): boolean {
  try {
    const snapshot = getCliCircuitBreakerSnapshot(cli);
    if (snapshot?.state !== 'open') {
      return true;
    }
    factoryLogger.warn('CLI excluded from voter availability because circuit is open', {
      cli,
      circuitState: snapshot.state,
      failureCount: snapshot.failureCount,
    });
    return false;
  } catch {
    return true;
  }
}
