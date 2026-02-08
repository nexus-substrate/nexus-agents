/**
 * nexus-agents/core - Agent Types
 *
 * Base interface for all agents (TechLead, Experts, dynamic agents).
 */

import type { Result } from '../result.js';
import type { AgentError } from '../errors.js';

/**
 * Agent state in the lifecycle.
 */
export type AgentState = 'idle' | 'thinking' | 'acting' | 'waiting' | 'error';

/**
 * Predefined agent roles.
 *
 * @remarks
 * 'orchestrator' is the preferred name for the coordination agent (Issue #759).
 * 'tech_lead' is retained for backward compatibility but will be deprecated in v3.0.
 */
export type AgentRole =
  | 'orchestrator' // Preferred: Coordinates multi-agent workflows (Issue #759)
  | 'tech_lead' // @deprecated Use 'orchestrator' instead. Retained for backward compatibility.
  | 'code_expert'
  | 'architecture_expert'
  | 'security_expert'
  | 'documentation_expert'
  | 'testing_expert'
  | 'devops_expert'
  | 'research_expert'
  | 'pm_expert' // Product manager: requirements, user stories, acceptance criteria (Issue #902)
  | 'ux_expert' // UX designer: interaction design, usability, user journeys (Issue #902)
  | 'thinker' // TRINITY: High-level reasoning (arXiv:2512.04695)
  | 'worker' // TRINITY: Task execution
  | 'verifier' // TRINITY: Output validation
  | 'custom';

/**
 * Role type for the orchestration/coordination agent.
 * Includes both 'orchestrator' (preferred) and 'tech_lead' (deprecated).
 */
export type OrchestratorRole = Extract<AgentRole, 'orchestrator' | 'tech_lead'>;

/**
 * @deprecated Use {@link OrchestratorRole} instead. Will be removed in v3.0.
 */
export type TechLeadRole = OrchestratorRole;

/**
 * Agent capabilities.
 */
export const AgentCapability = {
  TASK_EXECUTION: 'task_execution',
  DELEGATION: 'delegation',
  COLLABORATION: 'collaboration',
  TOOL_USE: 'tool_use',
  CODE_GENERATION: 'code_generation',
  CODE_REVIEW: 'code_review',
  RESEARCH: 'research',
} as const;

export type AgentCapability = (typeof AgentCapability)[keyof typeof AgentCapability];

/**
 * Task context and constraints.
 */
export interface TaskContext {
  /** Working directory or scope */
  workingDirectory?: string;
  /** Relevant files */
  files?: string[];
  /** Previous messages in conversation */
  history?: TaskHistoryItem[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface TaskHistoryItem {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

/**
 * Constraints on task execution.
 *
 * @remarks
 * Enforcement status of each field (Issue #469):
 * - `maxDuration`: ENFORCED - Task times out after this duration
 * - `maxTokens`: INFORMATIONAL - Included in task context for agent awareness, not enforced
 * - `outputFormat`: DEPRECATED - Not enforced, will be removed in v3.0
 * - `allowedTools`: DEPRECATED - Not enforced, will be removed in v3.0
 */
export interface TaskConstraints {
  /** Maximum execution time in ms. ENFORCED via timeout mechanism. */
  maxDuration?: number;
  /**
   * Maximum tokens to use. INFORMATIONAL only - agents can see this but it's not enforced.
   * Use model adapter budgets for actual token enforcement.
   */
  maxTokens?: number;
  /**
   * Required output format.
   * @deprecated Not enforced. Will be removed in v3.0.
   * Use structured output patterns at the prompt level instead.
   */
  outputFormat?: 'text' | 'json' | 'markdown';
  /**
   * Allowed tools for this task.
   * @deprecated Not enforced. Will be removed in v3.0.
   * Use policy firewall rules for tool restrictions instead.
   */
  allowedTools?: string[];
}

/**
 * Task to be executed by an agent.
 */
export interface Task {
  /** Unique task identifier */
  id: string;
  /** Task description */
  description: string;
  /** Task context */
  context: TaskContext;
  /** Optional constraints. See {@link TaskConstraints} for enforcement status. */
  constraints?: TaskConstraints;
  /**
   * Priority (higher = more urgent).
   * INFORMATIONAL - Logged but not used for scheduling or execution order.
   */
  priority?: number;
}

/**
 * Metadata about task execution.
 */
export interface ResultMetadata {
  /** Execution duration in ms */
  durationMs: number;
  /** Tokens used */
  tokensUsed: number;
  /** Tools invoked */
  toolsUsed: string[];
  /** Model used */
  model: string;
}

/**
 * Result of task execution.
 */
export interface TaskResult {
  /** Task that was executed */
  taskId: string;
  /** Result output */
  output: unknown;
  /** Execution metadata */
  metadata: ResultMetadata;
}

/**
 * Inter-agent message types.
 */
export type AgentMessageType = 'task' | 'result' | 'query' | 'feedback' | 'status';

/**
 * Message between agents.
 */
export interface AgentMessage {
  /** Unique message identifier */
  id: string;
  /** Sender agent ID */
  from: string;
  /** Recipient agent ID */
  to: string;
  /** Message type */
  type: AgentMessageType;
  /** Message payload */
  payload: unknown;
  /** Timestamp */
  timestamp: string;
}

/**
 * Response to an agent message.
 */
export interface AgentResponse {
  /** Original message ID */
  messageId: string;
  /** Response status */
  status: 'accepted' | 'rejected' | 'completed' | 'failed';
  /** Response data */
  data?: unknown;
  /** Error message if failed */
  error?: string;
}

/**
 * Context provided during agent initialization.
 */
export interface AgentContext {
  /** Agent configuration */
  config: AgentConfig;
  /** Available tools */
  tools?: string[];
  /** Shared memory/state */
  sharedState?: Record<string, unknown>;
}

/**
 * Agent configuration.
 */
export interface AgentConfig {
  /** Model to use */
  modelId: string;
  /** Temperature for generation */
  temperature?: number;
  /** System prompt */
  systemPrompt?: string;
  /** Maximum context tokens */
  maxContextTokens?: number;
}

/**
 * Base interface for all agents.
 */
export interface IAgent {
  /** Unique agent identifier */
  readonly id: string;

  /** Agent role */
  readonly role: AgentRole;

  /** Current state */
  readonly state: AgentState;

  /** Agent capabilities */
  readonly capabilities: readonly AgentCapability[];

  /**
   * Execute a task.
   * @param task - Task to execute
   * @returns Result with TaskResult or AgentError
   */
  execute(task: Task): Promise<Result<TaskResult, AgentError>>;

  /**
   * Handle an inter-agent message.
   * @param msg - Message to handle
   * @returns Result with AgentResponse or AgentError
   */
  handleMessage(msg: AgentMessage): Promise<Result<AgentResponse, AgentError>>;

  /**
   * Initialize the agent with context.
   * @param ctx - Agent context
   * @returns Result with void or AgentError
   */
  initialize(ctx: AgentContext): Promise<Result<void, AgentError>>;

  /**
   * Cleanup agent resources.
   */
  cleanup(): Promise<void>;
}
