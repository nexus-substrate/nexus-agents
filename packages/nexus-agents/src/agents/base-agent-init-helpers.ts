/**
 * nexus-agents/agents - BaseAgent Initialization Helpers
 *
 * Helper functions for agent initialization in BaseAgent.
 * Extracted to reduce file size in base-agent.ts (Issue #340).
 *
 * @module agents/base-agent-init-helpers
 */

import type { Result, ILogger, AgentContext, AgentRole } from '../core/index.js';
import { ok, err, AgentError } from '../core/index.js';
import type { IMemoryBackend } from '../context/memory-backend-types.js';
import type { ITypedMemory, TypedMemoryEntry } from '../context/memory-types.js';
import {
  loadMemoryState,
  loadRelevantTypedMemories,
  type AgentMemoryState,
} from './base-agent-memory-init.js';

/**
 * Context for initialization operations.
 */
export interface InitializationContext {
  agentId: string;
  role: AgentRole;
  initialized: boolean;
  memoryEnabled: boolean;
  memoryBackend: IMemoryBackend | undefined;
  typedMemory: ITypedMemory | undefined;
  maxInitialLoadEntries: number;
  autoLoadOnInit: boolean;
  logger: ILogger;
}

/**
 * Result of memory initialization on agent init.
 */
export interface MemoryInitResult {
  memoryState: AgentMemoryState | null;
  relevantMemories: readonly TypedMemoryEntry[];
}

/**
 * Validates that agent is not already initialized.
 */
export function validateNotInitialized(
  agentId: string,
  initialized: boolean
): Result<void, AgentError> {
  if (initialized) {
    return err(new AgentError('Agent already initialized', { context: { agentId } }));
  }
  return ok(undefined);
}

/**
 * Loads memory state on initialization.
 */
export async function loadMemoryOnInit(ctx: InitializationContext): Promise<MemoryInitResult> {
  let memoryState: AgentMemoryState | null = null;
  let relevantMemories: readonly TypedMemoryEntry[] = [];

  if (ctx.memoryBackend !== undefined) {
    const stateResult = await loadMemoryState(ctx.memoryBackend, ctx.agentId, ctx.role, ctx.logger);
    if (stateResult.ok) {
      memoryState = stateResult.value;
    }
  }

  if (ctx.typedMemory !== undefined) {
    const memoriesResult = await loadRelevantTypedMemories(
      ctx.typedMemory,
      ctx.role,
      ctx.maxInitialLoadEntries,
      ctx.logger
    );
    if (memoriesResult.ok) {
      relevantMemories = memoriesResult.value;
    }
  }

  return { memoryState, relevantMemories };
}

/**
 * Performs full agent initialization.
 */
export async function performInitialization(
  ctx: InitializationContext,
  agentCtx: AgentContext
): Promise<
  Result<
    {
      memoryState: AgentMemoryState | null;
      relevantMemories: readonly TypedMemoryEntry[];
    },
    AgentError
  >
> {
  const validationResult = validateNotInitialized(ctx.agentId, ctx.initialized);
  if (!validationResult.ok) {
    return validationResult as Result<never, AgentError>;
  }

  ctx.logger.info('Initializing agent', {
    modelId: agentCtx.config.modelId,
    hasTools: agentCtx.tools !== undefined && agentCtx.tools.length > 0,
    memoryEnabled: ctx.memoryEnabled,
  });

  let memoryState: AgentMemoryState | null = null;
  let relevantMemories: readonly TypedMemoryEntry[] = [];

  if (ctx.memoryEnabled && ctx.autoLoadOnInit) {
    const memoryResult = await loadMemoryOnInit(ctx);
    memoryState = memoryResult.memoryState;
    relevantMemories = memoryResult.relevantMemories;
  }

  return ok({ memoryState, relevantMemories });
}
