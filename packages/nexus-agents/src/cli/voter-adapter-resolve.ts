/**
 * Adapter resolution for a voter panel, and the documented no-adapter exit
 * (Issue #280): simulate when the caller explicitly allowed it, otherwise
 * throw.
 *
 * Split out of `voter-agents.ts` (#5578), which was at its 400-line cap.
 * @module cli/voter-adapter-resolve
 */

import type { IModelAdapter, ILogger } from '../core/index.js';
import { getErrorMessage } from '../core/index.js';
import { getGlobalRegistry } from '../adapters/unified-registry.js';

/** The adapter-bearing subset of the collect options this module needs. */
export interface AdapterResolveOptions {
  readonly adapter?: IModelAdapter | undefined;
  readonly gatewayAdapters?: readonly IModelAdapter[] | undefined;
}

/**
 * Error thrown when no adapter is available and simulation is disabled.
 */
export class NoAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoAdapterError';
  }
}

/**
 * Resolves the model adapter, handling errors per Issue #280.
 */
export function resolveAdapter(
  options: AdapterResolveOptions,
  logger: ILogger
): { adapter: IModelAdapter } | { error: string } {
  try {
    if (options.adapter !== undefined) return { adapter: options.adapter };
    // #4040: prefer an in-process gateway adapter as the fallback so a
    // gateway-only environment (no CLIs installed) never hits the CLI registry,
    // which would throw "No model adapter configured".
    const gateway = options.gatewayAdapters;
    if (gateway !== undefined && gateway.length > 0 && gateway[0] !== undefined) {
      return { adapter: gateway[0] };
    }
    const registry = getGlobalRegistry({ logger });
    return { adapter: registry.getDefault() };
  } catch (error) {
    return { error: getErrorMessage(error) };
  }
}

/**
 * Resolve the adapter, or take the documented no-adapter exit (Issue #280):
 * simulate when the caller explicitly allowed it, otherwise throw.
 *
 * Extracted from `collectRealVotes` when #5578 pushed it past the 50-line and
 * complexity caps; behaviour is unchanged.
 */
export function resolveAdapterOrFail(
  options: AdapterResolveOptions,
  logger: ILogger,
  allowSimulation: boolean
): { adapter: IModelAdapter } | { simulated: true } {
  const resolved = resolveAdapter(options, logger);
  if (!('error' in resolved)) return resolved;

  logger.error('No adapter available for voting', undefined, { error: resolved.error });
  if (allowSimulation) {
    logger.warn('Falling back to simulation (allowSimulation=true)');
    return { simulated: true };
  }
  throw new NoAdapterError(
    `No adapter available for voting: ${resolved.error}. ` +
      'Install a CLI (claude/gemini/codex) or set ANTHROPIC_API_KEY.'
  );
}
