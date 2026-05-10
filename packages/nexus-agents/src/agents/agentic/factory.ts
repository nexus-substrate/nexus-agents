/**
 * Factory for `IAgenticAdapter`.
 *
 * v1 returns a single concrete `AgenticAdapter` for any
 * `IModelAdapter` — the underlying model adapter handles
 * provider-specific tool-use translation already. Provider-specialised
 * concretes (`AnthropicAgenticAdapter`, etc.) can register here later
 * if real fidelity gaps surface; consumers call this factory and
 * never know the difference.
 *
 * @module agents/agentic/factory
 */

import type { IModelAdapter } from '../../core/index.js';
import { AgenticAdapter, type AgenticAdapterOptions } from './agentic-adapter.js';
import type { IAgenticAdapter } from './types.js';

/**
 * Build an `IAgenticAdapter` for the supplied model adapter.
 *
 * Stamps `adapterStrategy` based on the model's `providerId` so
 * downstream eval results record which path they exercised. Future
 * provider-specialised concretes will set their own strategy.
 */
export function createAgenticAdapter(
  modelAdapter: IModelAdapter,
  options: AgenticAdapterOptions = {}
): IAgenticAdapter {
  return new AgenticAdapter(modelAdapter, options);
}
