/**
 * nexus-agents/agents - BaseAgent Context Builders
 *
 * Helper functions for creating context objects used in BaseAgent methods.
 * Extracted to reduce file size in base-agent.ts (Issue #340).
 *
 * @module agents/base-agent-context-builders
 */

import type { ILogger, IModelAdapter, AgentRole, AgentCapability } from '../core/index.js';
import type { ITokenBudgetTracker } from '../context/token-budget-tracker.js';
import type { IContextMemoryBackend } from '../context/memory-backend-types.js';
import type { ITypedMemory } from '../context/memory-types.js';
import type { AgentStateMachine } from './state-machine.js';
import type { ICollaborationEventBus } from './collaboration/event-bus-types.js';
import type { ContextPruner } from './context-pruner.js';
import type { ResolvedPruningConfig, ContextPruningMetrics } from './base-agent-pruning-init.js';
import type { ResolvedMemoryConfig, AgentMemoryState } from './base-agent-memory-init.js';
import type { InitializationContext } from './base-agent-init-helpers.js';
import type { MessageHandlerContext } from './base-agent-message-handlers.js';
import type { CompleteFlowContext } from './base-agent-complete-flow.js';
import type { ExecuteFlowContext, TaskMemoryContext } from './base-agent-execute-flow.js';

/**
 * All agent state needed to build context objects.
 */
export interface AgentContextState {
  readonly id: string;
  readonly role: AgentRole;
  readonly capabilities: readonly AgentCapability[];
  readonly initialized: boolean;
  readonly historyLength: number;
  readonly adapter: IModelAdapter | undefined;
  readonly logger: ILogger;
  readonly stateMachine: AgentStateMachine;
  readonly budgetTracker: ITokenBudgetTracker;
  readonly eventBus: ICollaborationEventBus;
  readonly memoryEnabled: boolean;
  readonly memoryBackend: IContextMemoryBackend | undefined;
  readonly typedMemory: ITypedMemory | undefined;
  readonly memoryConfig: ResolvedMemoryConfig;
  readonly memoryState: AgentMemoryState | null;
  readonly contextPruningEnabled: boolean;
  readonly contextPruner: ContextPruner | undefined;
  readonly pruningConfig: ResolvedPruningConfig;
  readonly pruningMetrics: ContextPruningMetrics;
}

/**
 * Builds the initialization context for performInitialization.
 */
export function buildInitializationContext(state: AgentContextState): InitializationContext {
  return {
    agentId: state.id,
    role: state.role,
    initialized: state.initialized,
    memoryEnabled: state.memoryEnabled,
    memoryBackend: state.memoryBackend,
    typedMemory: state.typedMemory,
    maxInitialLoadEntries: state.memoryConfig.maxInitialLoadEntries,
    autoLoadOnInit: state.memoryConfig.autoLoadOnInit,
    logger: state.logger,
  };
}

/**
 * Builds the message handler context for dispatchMessage.
 */
export function buildMessageHandlerContext(state: AgentContextState): MessageHandlerContext {
  return {
    id: state.id,
    role: state.role,
    state: state.stateMachine.state,
    capabilities: state.capabilities,
    initialized: state.initialized,
    historyLength: state.historyLength,
    logger: state.logger,
  };
}

/**
 * Builds the complete flow context for model completion.
 */
export function buildCompleteFlowContext(state: AgentContextState): CompleteFlowContext {
  return {
    agentId: state.id,
    adapter: state.adapter,
    budgetTracker: state.budgetTracker,
    contextPruningEnabled: state.contextPruningEnabled,
    contextPruner: state.contextPruner,
    pruningConfig: state.pruningConfig,
    pruningMetrics: state.pruningMetrics,
    eventBus: state.eventBus,
  };
}

/**
 * Builds the execute flow context for task execution.
 */
export function buildExecuteFlowContext(state: AgentContextState): ExecuteFlowContext {
  return {
    agentId: state.id,
    stateMachine: state.stateMachine,
    budgetTracker: state.budgetTracker,
    logger: state.logger,
    memoryEnabled: state.memoryEnabled,
    memoryState: state.memoryState,
  };
}

/**
 * Builds the task memory context for memory operations during task execution.
 */
export function buildTaskMemoryContext(state: AgentContextState): TaskMemoryContext {
  return {
    memoryEnabled: state.memoryEnabled,
    memoryBackend: state.memoryBackend,
    memoryState: state.memoryState,
    persistenceMode: state.memoryConfig.persistenceMode,
  };
}
