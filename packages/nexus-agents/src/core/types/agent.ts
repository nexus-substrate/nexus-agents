/**
 * nexus-agents/core - Agent Types
 *
 * Base interface for all agents (TechLead, Experts, dynamic agents).
 */

import type { Result } from '../result.js';
import type { AgentError } from '../errors.js';
import type { CliNameLiteral } from '../../config/model-capabilities-types.js';

/**
 * Agent state in the lifecycle.
 */
export type AgentState = 'idle' | 'thinking' | 'acting' | 'waiting' | 'error';

/**
 * Predefined agent roles.
 */
export type AgentRole =
  | 'orchestrator' // Coordinates multi-agent workflows (Issue #759)
  | 'code_expert'
  | 'architecture_expert'
  | 'security_expert'
  | 'documentation_expert'
  | 'testing_expert'
  | 'devops_expert'
  | 'research_expert'
  | 'pm_expert' // Product manager: requirements, user stories, acceptance criteria (Issue #902)
  | 'ux_expert' // UX designer: interaction design, usability, user journeys (Issue #902)
  | 'infrastructure_expert' // Physical server, bare metal, OOB management (Issue #1082)
  | 'qa_expert' // Quality assurance: code review, standards compliance, regression (#1684)
  | 'data_visualization_expert' // Data analysis, chart design, interactive visualizations
  | 'thinker' // TRINITY: High-level reasoning (arXiv:2512.04695)
  | 'worker' // TRINITY: Task execution
  | 'verifier' // TRINITY: Output validation
  | 'custom';

/**
 * Role type for the orchestration/coordination agent.
 */
export type OrchestratorRole = Extract<AgentRole, 'orchestrator'>;

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
  /** Tokens used. Meaningful only when {@link ResultMetadata.tokensMeasured} is not `false`. */
  tokensUsed: number;
  /**
   * Whether `tokensUsed` is a measurement (#4734).
   *
   * `false` means the adapter reported no usage, so `tokensUsed` is a
   * placeholder zero and NOT a count — a step that consumed unreported tokens
   * must not be read as having spent nothing, which for a spend cap
   * under-counts in the dangerous direction.
   *
   * Absent means the producer predates this distinction: unknown, not
   * measured. `step-executor` only drops a value on an explicit `false`, so a
   * legacy producer keeps its current behaviour.
   *
   * This flag exists because `tokensUsed` is required on a structurally public
   * type (`TaskResult.metadata`, exported via `exports/core.ts:52`), so making
   * it optional would break every downstream reader. The workflow ledger reads
   * `StepResult.tokensUsed`, which is already optional and CAN represent
   * absence — see #4744.
   */
  tokensMeasured?: boolean;
  /** Tools invoked */
  toolsUsed: string[];
  /** Model used */
  model: string;
  /** CLI used by the last model-backed step, when the adapter reports CLI identity. */
  readonly executedCli?: CliNameLiteral;
  /** Whether the executed CLI identity was measured or remains unknown. */
  readonly executedCliSource?: 'executed' | 'unknown';
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
   * @param options - Optional execution options (#3016/#3040).
   *   `signal` cancels the in-flight model call when the caller's deadline
   *   wins a race; without it, the SDK keeps running to its own 10-minute
   *   timeout after the caller has already discarded the result.
   * @returns Result with TaskResult or AgentError
   */
  execute(task: Task, options?: { signal?: AbortSignal }): Promise<Result<TaskResult, AgentError>>;

  /**
   * Handle an inter-agent message and return a response.
   *
   * **Delivery semantics (#3222).** This is a *direct, awaited request/response*
   * call: the caller invokes it and holds the returned promise. It is NOT a
   * queued or broadcast channel — that is the collaboration event bus
   * (`agents/collaboration/event-bus.ts`), a fire-and-forget pub/sub with its
   * own semantics. For this method specifically:
   * - **Ordering** is the caller's responsibility. Sequential `await`s are
   *   handled in call order; concurrent calls carry no cross-message ordering
   *   guarantee.
   * - **Delivery** is exactly the method invocation — there is **no automatic
   *   retry or redelivery**. A returned `err(...)` is the caller's signal to
   *   decide whether to retry; the agent does not re-queue the message.
   * - **Errors** surface as `Result.err`, not as a throw for expected
   *   conditions; the caller branches on the `Result`.
   *
   * @param msg - Message to handle
   * @returns Result with AgentResponse, or AgentError on failure (not retried)
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
