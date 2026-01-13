/**
 * nexus-agents/core - Type Exports
 */

// Model types
export type {
  IModelAdapter,
  CompletionRequest,
  CompletionResponse,
  Message,
  MessageRole,
  ContentBlock,
  ToolDefinition,
  ResponseFormat,
  TokenUsage,
  StopReason,
  StreamChunk,
} from './model.js';
export { ModelCapability } from './model.js';

// Agent types
export type {
  IAgent,
  Task,
  TaskContext,
  TaskConstraints,
  TaskHistoryItem,
  TaskResult,
  ResultMetadata,
  AgentMessage,
  AgentMessageType,
  AgentResponse,
  AgentContext,
  AgentConfig,
  AgentState,
  AgentRole,
} from './agent.js';
export { AgentCapability } from './agent.js';

// Workflow types
export type {
  IWorkflowEngine,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowResult,
  WorkflowTemplate,
  InputDefinition,
  StepResult,
  ExecutionStatus,
  ContextBudget,
  PartialContextBudget,
} from './workflow.js';
export { ParseError } from './workflow.js';

// Tool types
export type { ITool, IToolRegistry, ToolResult, ToolContentBlock, ToolInfo } from './tool.js';
export { ToolError } from './tool.js';

// Routing Memory types (Issue #238, Consensus Approved 75%)
export type {
  IRoutingMemory,
  TaskProfileSummary,
  RoutingDecisionRecord,
  TaskOutcomeRecord,
  PreferenceSignal,
  PreferenceRecord,
  PreferenceFilter,
  ExperienceStep,
  ExperienceRecord,
  ActionRecord,
  RoutingMemoryExport,
  RoutingMemoryStats,
} from './routing-memory.js';
