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

import type { ICliAdapter, CliName, CliTransport } from './types.js';
import { getTimeProvider } from '../core/index.js';
import { ClaudeCliAdapter } from './adapters/claude-adapter.js';
import { GeminiCliAdapter } from './adapters/gemini-adapter.js';
import { CodexCliAdapter } from './adapters/codex-adapter.js';
import { CodexMcpAdapter } from './adapters/codex-mcp-adapter.js';
import { OpenCodeCliAdapter } from './adapters/opencode-adapter.js';
import type { ILogger } from '../core/index.js';
import type { ICliDetectionCache } from './cli-detection-cache.js';
import { CliDetectionCache } from './cli-detection-cache.js';
import { probeCli } from '../cli/cli-auth-probe.js';

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
 * Creates all available CLI adapters.
 * Uses MCP transport for Codex by default (preferred).
 *
 * @param logger - Optional shared logger
 * @param codexTransport - Transport for Codex (default: 'mcp')
 * @returns Map of CLI name to adapter
 */
export function createAllAdapters(
  logger?: ILogger,
  codexTransport: CliTransport = 'mcp'
): Map<CliName, ICliAdapter> {
  const adapters = new Map<CliName, ICliAdapter>();
  const options = logger !== undefined ? { logger } : undefined;

  adapters.set('claude', new ClaudeCliAdapter(options));
  adapters.set('gemini', new GeminiCliAdapter(options));
  adapters.set('codex', createCodexAdapter(codexTransport, options ?? {}));
  adapters.set('opencode', new OpenCodeCliAdapter(options));

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
  } catch {
    // Store negative result in cache
    if (cache !== undefined) {
      cache.set(cli, {
        healthy: false,
        version: 'unknown',
        versionStatus: 'unsupported',
        checkedAt: new Date(getTimeProvider().now()),
        message: 'Health check failed',
      });
    }
    return false;
  }
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
    .map((r) => r.value.cli);
}
