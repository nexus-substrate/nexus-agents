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
  /** Preferred transport (for Codex: 'mcp' or 'subprocess') */
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
 * Creates a Codex adapter with preferred transport.
 * Defaults to MCP transport (most stable).
 *
 * @param transport - Preferred transport ('mcp' or 'subprocess')
 * @param options - Adapter options
 * @returns Codex CLI adapter
 */
function createCodexAdapter(
  transport: CliTransport | undefined,
  options: { model?: string; logger?: ILogger }
): ICliAdapter {
  // Default to MCP transport (preferred per Issue #90)
  if (transport === 'subprocess') {
    return new CodexCliAdapter(options);
  }
  return new CodexMcpAdapter(options);
}

/**
 * Creates all available routing-arm adapters.
 * Uses MCP transport for Codex by default (preferred).
 *
 * The four CLI slots are always registered under their slot key. When
 * `NEXUS_BILLING_MODE=api`, the direct-API adapters whose keys are present are
 * ALSO appended as distinct `api:<vendor>` routing arms (#3422) so the router /
 * bandit can score them separately from the CLI slots. DEFAULT (plan) mode
 * returns CLIs only — never surprise API spend. Key-presence-only and
 * deterministic; keys are never validated by calling out.
 *
 * @param logger - Optional shared logger
 * @param codexTransport - Transport for Codex (default: 'mcp')
 * @returns Map of routing arm id to adapter
 */
export function createAllAdapters(
  logger?: ILogger,
  codexTransport: CliTransport = 'mcp'
): Map<RoutingArmId, ICliAdapter> {
  const adapters = new Map<RoutingArmId, ICliAdapter>();
  const options = logger !== undefined ? { logger } : undefined;

  adapters.set('claude', new ClaudeCliAdapter(options));
  adapters.set('gemini', new GeminiCliAdapter(options));
  adapters.set('codex', createCodexAdapter(codexTransport, options ?? {}));
  adapters.set('opencode', new OpenCodeCliAdapter(options));

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
    const available = health.healthy && auth.state === 'authenticated';

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
          message:
            auth.state === 'authenticated'
              ? health.message
              : `auth: ${auth.state}` + ('reason' in auth ? ` (${auth.reason})` : ''),
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
 * Uses cache if provided to avoid repeated subprocess calls.
 *
 * @param cache - Optional cache to use
 * @returns Array of available CLI names
 */
export async function getAvailableClis(cache?: ICliDetectionCache): Promise<CliName[]> {
  const clis: CliName[] = ['claude', 'gemini', 'codex', 'opencode'];

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
