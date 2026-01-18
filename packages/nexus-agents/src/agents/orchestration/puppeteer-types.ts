/**
 * Puppeteer Orchestration Types
 *
 * Type definitions for Puppeteer-style learned orchestration.
 * Implements centralized orchestrator with dynamic agent selection
 * via learned/rule-based policies.
 *
 * @module agents/orchestration/puppeteer-types
 * (Source: Issue #335, arXiv:2505.19591)
 */

import { z } from 'zod';
import type { IAgent, Task, AgentRole } from '../../core/index.js';

// =============================================================================
// Agent Step Output
// =============================================================================

/**
 * Output from a single agent step.
 */
export interface AgentStepOutput {
  /** Step number (0-indexed) */
  readonly step: number;
  /** ID of the agent that executed */
  readonly agentId: string;
  /** Output from the agent */
  readonly output: unknown;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  /** Tokens consumed */
  readonly tokensUsed: number;
  /** Model used for execution */
  readonly model: string;
}

// =============================================================================
// State Metadata
// =============================================================================

/**
 * Metadata for policy computation and tracking.
 */
export interface PuppeteerStateMetadata {
  /** Estimated task progress (0-1) */
  readonly progress: number;
  /** Accumulated cost in dollars */
  readonly totalCost: number;
  /** Accumulated tokens */
  readonly totalTokens: number;
  /** Time elapsed in milliseconds */
  readonly elapsedMs: number;
  /** Start timestamp (ISO 8601) */
  readonly startedAt: string;
}

// =============================================================================
// Puppeteer State
// =============================================================================

/**
 * Global system state at step t.
 * Aggregates all relevant context for agent selection.
 */
export interface PuppeteerState {
  /** Current step number (0-indexed) */
  readonly step: number;
  /** Task being executed */
  readonly task: Task;
  /** Accumulated agent outputs */
  readonly agentOutputs: readonly AgentStepOutput[];
  /** Current working context (compressed) */
  readonly context: string;
  /** Metadata for policy computation */
  readonly metadata: PuppeteerStateMetadata;
  /** Session identifier for tracking */
  readonly sessionId: string;
}

// =============================================================================
// Agent Distribution
// =============================================================================

/**
 * Agent selection probability distribution.
 * Computed by the policy engine.
 */
export interface AgentDistribution {
  /** Map of agentId -> selection probability */
  readonly probabilities: ReadonlyMap<string, number>;
  /** Scores before normalization (for debugging) */
  readonly rawScores: ReadonlyMap<string, number>;
  /** Reasoning for top choices */
  readonly reasoning: string;
}

// =============================================================================
// Step Result
// =============================================================================

/** Reasons for terminating orchestration. */
export type PuppeteerTerminationReason =
  | 'task_complete'
  | 'max_steps'
  | 'timeout'
  | 'error'
  | 'cancelled'
  | 'convergence';

/**
 * Result of one orchestration step.
 */
export interface PuppeteerStepResult {
  /** ID of the selected agent */
  readonly selectedAgent: string;
  /** Distribution used for selection */
  readonly distribution: AgentDistribution;
  /** Output from the agent */
  readonly agentOutput: AgentStepOutput;
  /** Updated state after this step */
  readonly newState: PuppeteerState;
  /** Reward for this step */
  readonly reward: number;
  /** Whether orchestration should terminate */
  readonly shouldTerminate: boolean;
  /** Reason for termination (if shouldTerminate) */
  readonly terminationReason?: PuppeteerTerminationReason;
}

// =============================================================================
// Emergent Patterns
// =============================================================================

/**
 * Information about a hub agent.
 */
export interface HubAgentInfo {
  /** Agent identifier */
  readonly agentId: string;
  /** Number of times activated */
  readonly activationCount: number;
  /** Percentage of total activations */
  readonly percentage: number;
}

/**
 * Information about a detected cycle.
 */
export interface CycleInfo {
  /** Agents in the cycle (ordered) */
  readonly agents: readonly string[];
  /** Number of occurrences */
  readonly occurrences: number;
}

/**
 * Detected emergent patterns during orchestration.
 */
export interface EmergentPatterns {
  /** Hub agents that received disproportionate traffic */
  readonly hubAgents: readonly HubAgentInfo[];
  /** Detected cyclic patterns in agent sequence */
  readonly cycles: readonly CycleInfo[];
  /** Graph density (measure of compaction) */
  readonly graphDensity: number;
  /** Cyclicality score (0-1) */
  readonly cyclicalityScore: number;
}

// =============================================================================
// Metrics
// =============================================================================

/**
 * Metrics from orchestration execution.
 */
export interface PuppeteerMetrics {
  /** Average reward across steps */
  readonly avgReward: number;
  /** Task completion rate (0-1) */
  readonly taskCompletionRate: number;
  /** Efficiency score (lower is better) */
  readonly efficiencyScore: number;
  /** Compaction score (0-1, higher means more hub concentration) */
  readonly compactionScore: number;
  /** Cyclicality score (0-1, higher means more cyclic patterns) */
  readonly cyclicalityScore: number;
}

// =============================================================================
// Final Result
// =============================================================================

/**
 * Final result of Puppeteer orchestration.
 */
export interface PuppeteerResult {
  /** Whether orchestration succeeded */
  readonly success: boolean;
  /** Final output from the orchestration */
  readonly output: unknown;
  /** Execution trajectory (all steps) */
  readonly trajectory: readonly PuppeteerStepResult[];
  /** Total steps executed */
  readonly totalSteps: number;
  /** Total duration in milliseconds */
  readonly totalDurationMs: number;
  /** Total tokens consumed */
  readonly totalTokens: number;
  /** Total cost in dollars */
  readonly totalCost: number;
  /** Detected emergent patterns */
  readonly emergentPatterns: EmergentPatterns;
  /** Execution metrics */
  readonly metrics: PuppeteerMetrics;
  /** Reason for termination */
  readonly terminationReason: PuppeteerTerminationReason;
  /** Session identifier */
  readonly sessionId: string;
}

// =============================================================================
// Configuration
// =============================================================================

/** Policy mode for agent selection. */
export type PolicyMode = 'rule_based' | 'learned' | 'hybrid';

/**
 * Configuration for PuppeteerOrchestrator.
 */
export interface PuppeteerConfig {
  /** Maximum steps per task (default: 10) */
  readonly maxSteps?: number;
  /** Timeout in milliseconds (default: 300000 = 5 min) */
  readonly timeoutMs?: number;
  /** Policy mode: rule-based, learned, or hybrid (default: rule_based) */
  readonly policyMode?: PolicyMode;
  /** Discount factor for rewards (gamma, default: 0.99) */
  readonly discountFactor?: number;
  /** Exploration rate for sampling (epsilon, default: 0.1) */
  readonly explorationRate?: number;
  /** Whether to track emergent patterns (default: true) */
  readonly trackEmergentPatterns?: boolean;
  /** Cost per 1K tokens for efficiency calculation (default: 0.01) */
  readonly costPer1KTokens?: number;
  /** Maximum cost budget (default: 1.0) */
  readonly maxCostBudget?: number;
}

/** Default configuration values. */
export const DEFAULT_PUPPETEER_CONFIG: Required<PuppeteerConfig> = {
  maxSteps: 10,
  timeoutMs: 5 * 60 * 1000, // 5 minutes
  policyMode: 'rule_based',
  discountFactor: 0.99,
  explorationRate: 0.1,
  trackEmergentPatterns: true,
  costPer1KTokens: 0.01,
  maxCostBudget: 1.0,
};

// =============================================================================
// Execute Options
// =============================================================================

/**
 * Options for executing a task with Puppeteer.
 */
export interface PuppeteerExecuteOptions {
  /** Task to execute */
  readonly task: Task;
  /** Optional: override available agents */
  readonly agents?: readonly IAgent[];
  /** Optional: provide initial context */
  readonly initialContext?: string;
  /** Optional: signal for cancellation */
  readonly signal?: AbortSignal;
}

// =============================================================================
// Puppet Agent Types
// =============================================================================

/** Reasoning patterns for puppet agents. */
export type ReasoningPattern =
  | 'decomposition' // Break task into subtasks
  | 'reflection' // Self-evaluate and identify issues
  | 'refinement' // Improve previous output
  | 'critique' // Evaluate others' work
  | 'modification' // Make specific changes
  | 'summarization' // Condense information
  | 'execution' // Take external action
  | 'termination'; // Decide when complete

/**
 * Definition for creating puppet agents.
 */
export interface PuppetDefinition {
  /** Unique identifier */
  readonly id: string;
  /** Agent role */
  readonly role: AgentRole;
  /** Reasoning pattern this agent specializes in */
  readonly reasoningPattern: ReasoningPattern;
  /** Human-readable description */
  readonly description: string;
  /** Cost per invocation (relative, 0-1) */
  readonly invocationCost: number;
  /** Average latency in ms */
  readonly avgLatencyMs: number;
  /** Whether this agent can terminate the task */
  readonly canTerminate: boolean;
}

/**
 * Extended agent interface for puppet agents.
 */
export interface IPuppetAgent extends IAgent {
  /** Reasoning pattern this agent specializes in */
  readonly reasoningPattern: ReasoningPattern;
  /** Cost per invocation (relative, 0-1) */
  readonly invocationCost: number;
  /** Average latency in ms */
  readonly avgLatencyMs: number;
  /** Whether this agent can terminate the task */
  readonly canTerminate: boolean;
}

// =============================================================================
// Default Puppets
// =============================================================================

/** Default puppet agent configurations. */
export const DEFAULT_PUPPETS: readonly PuppetDefinition[] = [
  {
    id: 'puppet-decomposer',
    role: 'thinker',
    reasoningPattern: 'decomposition',
    description: 'Breaks complex tasks into manageable subtasks',
    invocationCost: 0.3,
    avgLatencyMs: 2000,
    canTerminate: false,
  },
  {
    id: 'puppet-reflector',
    role: 'thinker',
    reasoningPattern: 'reflection',
    description: 'Evaluates progress and identifies gaps',
    invocationCost: 0.2,
    avgLatencyMs: 1500,
    canTerminate: false,
  },
  {
    id: 'puppet-refiner',
    role: 'worker',
    reasoningPattern: 'refinement',
    description: 'Iteratively improves solutions',
    invocationCost: 0.4,
    avgLatencyMs: 3000,
    canTerminate: false,
  },
  {
    id: 'puppet-critic',
    role: 'verifier',
    reasoningPattern: 'critique',
    description: 'Provides detailed feedback on outputs',
    invocationCost: 0.25,
    avgLatencyMs: 2000,
    canTerminate: false,
  },
  {
    id: 'puppet-executor',
    role: 'worker',
    reasoningPattern: 'execution',
    description: 'Executes actions using tools',
    invocationCost: 0.5,
    avgLatencyMs: 5000,
    canTerminate: false,
  },
  {
    id: 'puppet-terminator',
    role: 'verifier',
    reasoningPattern: 'termination',
    description: 'Decides when task is complete',
    invocationCost: 0.1,
    avgLatencyMs: 1000,
    canTerminate: true,
  },
];

// =============================================================================
// Zod Schemas
// =============================================================================

/** Schema for PolicyMode. */
export const PolicyModeSchema = z.enum(['rule_based', 'learned', 'hybrid']);

/** Schema for PuppeteerTerminationReason. */
export const TerminationReasonSchema = z.enum([
  'task_complete',
  'max_steps',
  'timeout',
  'error',
  'cancelled',
  'convergence',
]);

/** Schema for ReasoningPattern. */
export const ReasoningPatternSchema = z.enum([
  'decomposition',
  'reflection',
  'refinement',
  'critique',
  'modification',
  'summarization',
  'execution',
  'termination',
]);

/** Schema for PuppeteerConfig. */
export const PuppeteerConfigSchema = z.object({
  maxSteps: z.number().int().positive().max(100).optional(),
  timeoutMs: z.number().int().positive().max(3600000).optional(),
  policyMode: PolicyModeSchema.optional(),
  discountFactor: z.number().min(0).max(1).optional(),
  explorationRate: z.number().min(0).max(1).optional(),
  trackEmergentPatterns: z.boolean().optional(),
  costPer1KTokens: z.number().positive().optional(),
  maxCostBudget: z.number().positive().optional(),
});
