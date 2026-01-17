/**
 * nexus-agents/agents - BaseAgent Re-exports
 *
 * Re-exports for API consumers. Extracted to reduce base-agent.ts file size.
 */

// Re-export schemas and types for API consumers
export {
  TaskSchema,
  AgentMessageSchema,
  BaseAgentOptionsSchema,
  ContextPrunerAgentConfigSchema,
} from './agent-schemas.js';
export type { ContextPrunerAgentConfig, ContextPruningMetrics } from './base-agent-pruning-init.js';
export type { BaseAgentOptions } from './base-agent-types.js';
export {
  handleTaskMessage,
  handleQueryMessage,
  handleFeedbackMessage,
  handleStatusMessage,
  handleResultMessage,
  type MessageHandlerContext,
} from './base-agent-message-handlers.js';
