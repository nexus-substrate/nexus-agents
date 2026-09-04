/**
 * nexus-agents/agents - BaseAgent Constructor Helpers (Issue #348)
 *
 * Helper functions for BaseAgent constructor to keep it under 50 lines.
 * Extracted to comply with max-lines-per-function lint rule.
 */

import type { ILogger, IModelAdapter, AgentRole } from '../core/index.js';
import { AgentStateMachine, type StateMachineOptions } from './state-machine.js';
import type { ICollaborationEventBus } from './collaboration/event-bus-types.js';
import { createEvent } from './collaboration/event-bus.js';
import {
  initializePruningInfrastructure,
  type ContextPrunerAgentConfig,
  type PruningInfrastructure,
} from './base-agent-pruning-init.js';
import {
  initializeMemoryInfrastructure,
  type AgentMemoryConfig,
  type MemoryInfrastructure,
} from './base-agent-memory-init.js';

/** Parameters for state machine setup. */
export interface StateMachineSetupParams {
  agentId: string;
  logger: ILogger;
  eventBus: ICollaborationEventBus;
  options: StateMachineOptions | undefined;
}

/**
 * Creates and configures an AgentStateMachine with event emission.
 * Extracted from constructor to reduce line count (Issue #302).
 */
export function setupStateMachine(params: StateMachineSetupParams): AgentStateMachine {
  const { agentId, logger, eventBus, options } = params;

  const stateMachine = new AgentStateMachine(options);

  stateMachine.onStateChange((transition) => {
    logger.debug('State transition', {
      from: transition.from,
      to: transition.to,
      event: transition.event,
    });
    const event = createEvent('agent.state_changed', {
      agentId,
      ...transition,
    });
    eventBus.emit(event);
  });

  return stateMachine;
}

/** Parameters for infrastructure initialization. */
export interface InfrastructureInitParams {
  agentId: string;
  role: AgentRole;
  logger: ILogger;
  adapter: IModelAdapter | undefined;
  pruningConfig: ContextPrunerAgentConfig | undefined;
  memoryConfig: AgentMemoryConfig | undefined;
}

/** Combined infrastructure result. */
export interface InfrastructureResult {
  pruning: PruningInfrastructure;
  memory: MemoryInfrastructure;
}

/**
 * Initializes all infrastructure (pruning and memory) for BaseAgent.
 * Consolidates conditional logic to reduce constructor complexity.
 */
export function initializeInfrastructure(params: InfrastructureInitParams): InfrastructureResult {
  const { agentId, role, logger, adapter, pruningConfig, memoryConfig } = params;

  const pruningOpts = {
    logger,
    ...(pruningConfig !== undefined ? { config: pruningConfig } : {}),
    ...(adapter !== undefined ? { adapter } : {}),
  };
  const pruning = initializePruningInfrastructure(pruningOpts);

  const memoryOpts = {
    agentId,
    role,
    logger,
    ...(memoryConfig !== undefined ? { config: memoryConfig } : {}),
  };
  const memory = initializeMemoryInfrastructure(memoryOpts);

  return { pruning, memory };
}
