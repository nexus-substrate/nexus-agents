/**
 * nexus-agents/cli-adapters - Adapter Factory
 *
 * Factory for creating CLI adapters based on configuration.
 *
 * (Source: cli-project_plan.md v2.1.0)
 */

import type { ICliAdapter, CliName } from './types.js';
import { ClaudeCliAdapter } from './adapters/claude-adapter.js';
import { GeminiCliAdapter } from './adapters/gemini-adapter.js';
import { CodexCliAdapter } from './adapters/codex-adapter.js';
import type { ILogger } from '../core/index.js';

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
      return new CodexCliAdapter(options);

    default: {
      const exhaustiveCheck: never = config.cli;
      throw new Error(`Unsupported CLI: ${String(exhaustiveCheck)}`);
    }
  }
}

/**
 * Creates all available CLI adapters.
 *
 * @param logger - Optional shared logger
 * @returns Map of CLI name to adapter
 */
export function createAllAdapters(logger?: ILogger): Map<CliName, ICliAdapter> {
  const adapters = new Map<CliName, ICliAdapter>();
  const options = logger !== undefined ? { logger } : undefined;

  adapters.set('claude', new ClaudeCliAdapter(options));
  adapters.set('gemini', new GeminiCliAdapter(options));
  adapters.set('codex', new CodexCliAdapter(options));

  return adapters;
}

/**
 * Checks if a CLI is available by running a health check.
 *
 * @param cli - CLI name to check
 * @returns True if CLI is healthy
 */
export async function isCliAvailable(cli: CliName): Promise<boolean> {
  try {
    const adapter = createCliAdapter({ cli });
    const health = await adapter.healthCheck();
    return health.healthy;
  } catch {
    return false;
  }
}

/**
 * Gets all available CLIs by running health checks.
 *
 * @returns Array of available CLI names
 */
export async function getAvailableClis(): Promise<CliName[]> {
  const clis: CliName[] = ['claude', 'gemini', 'codex'];
  const available: CliName[] = [];

  for (const cli of clis) {
    if (await isCliAvailable(cli)) {
      available.push(cli);
    }
  }

  return available;
}
