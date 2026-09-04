/**
 * nexus-agents/agents - BaseAgent Type Definitions
 *
 * Type definitions for BaseAgent, extracted to reduce file size in base-agent.ts.
 */

import type { IModelAdapter, ILogger, AgentRole, AgentCapability } from '../core/index.js';
import type { TokenBudgetConfig } from '../context/token-budget-tracker.js';
import type { StateMachineOptions } from './state-machine.js';
import type { ICollaborationEventBus } from './collaboration/event-bus-types.js';
import type { ContextPrunerAgentConfig } from './base-agent-pruning-init.js';
import type { AgentMemoryConfig } from './base-agent-memory-init.js';

/**
 * Options for creating a BaseAgent.
 */
export interface BaseAgentOptions {
  /** Unique agent identifier */
  id: string;
  /** Agent role */
  role: AgentRole;
  /** Agent capabilities */
  capabilities: readonly AgentCapability[];
  /** Model adapter for LLM interactions */
  adapter?: IModelAdapter;
  /** Custom logger instance */
  logger?: ILogger;
  /** System prompt for the agent */
  systemPrompt?: string;
  /** Default temperature for completions */
  temperature?: number;
  /** Maximum tokens for responses */
  maxTokens?: number;
  /** Event bus for message observability (uses global bus if not provided) */
  eventBus?: ICollaborationEventBus;
  /** Whether to emit events for message handling (default: true) */
  emitMessageEvents?: boolean;
  /** State machine options for validated state transitions */
  stateMachineOptions?: StateMachineOptions;
  /** Token budget configuration for EMA-based tracking (Issue #304) */
  tokenBudget?: TokenBudgetConfig;
  /** Configuration for automatic context pruning (Issue #306) */
  contextPruning?: ContextPrunerAgentConfig;
  /** Configuration for memory backend integration (Issue #348) */
  memory?: AgentMemoryConfig;
}
