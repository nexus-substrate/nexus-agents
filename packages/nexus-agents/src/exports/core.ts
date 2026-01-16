/**
 * Core exports - Types, Result<T,E>, errors, and logger
 * Split from index.ts for file size compliance (Issue #285)
 */

export {
  // Result pattern
  type Result,
  ok,
  err,
  isOk,
  isErr,
  map,
  mapErr,
  unwrap,
  unwrapOr,
  // Error hierarchy
  ErrorCode,
  NexusError,
  ValidationError,
  ConfigError,
  ModelError,
  AgentError,
  WorkflowError,
  SecurityError,
  TimeoutError,
  RateLimitError,
  type SerializedError,
  type NexusErrorOptions,
  // Logger
  createLogger,
  logger,
  sanitize,
  type LogLevel,
  type LogContext,
  type LogEntry,
  type ILogger,
} from '../core/index.js';

// Re-export all types from core
export type {
  // Agent types
  IAgent,
  AgentState,
  AgentRole,
  AgentMessage,
  AgentMessageType,
  AgentResponse,
  // Task types
  Task,
  TaskContext,
  TaskResult,
  // Model types
  IModelAdapter,
  Message,
  ContentBlock,
  MessageRole,
  CompletionRequest,
  CompletionResponse,
  TokenUsage,
  StopReason,
  StreamChunk,
  ToolDefinition,
  // Workflow types
  IWorkflowEngine,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowTemplate,
  InputDefinition,
  StepResult,
} from '../core/index.js';

// Re-export enums/constants from core
export { ModelCapability, AgentCapability, ParseError } from '../core/index.js';
