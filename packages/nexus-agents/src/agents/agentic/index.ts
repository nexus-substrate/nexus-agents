/**
 * Public exports for the agentic-adapter primitive (#2529).
 *
 * @module agents/agentic
 */

export { AgenticAdapter, type AgenticAdapterOptions } from './agentic-adapter.js';
export { createAgenticAdapter } from './factory.js';
export {
  AgentError,
  type AgentRunResult,
  type AgentStopReason,
  type AgentTurn,
  type IAgenticAdapter,
  type RunAgentArgs,
  type ToolCall,
  type ToolResult,
} from './types.js';
