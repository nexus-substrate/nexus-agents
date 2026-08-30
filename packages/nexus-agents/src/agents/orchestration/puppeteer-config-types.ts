/**
 * Puppeteer Configuration Types
 *
 * Configuration and options for Puppeteer orchestration.
 *
 * @module agents/orchestration/puppeteer-config-types
 * (Source: Issue #335, arXiv:2505.19591)
 */

import type { IAgent, Task, AgentRole } from '../../core/index.js';

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

/**
 * Default cost rate, in USD per 1,000 tokens. Kept next to the config field it
 * backs so the two cannot drift apart — they silently agreed for months while
 * three call sites hardcoded the per-token form (#5171).
 */
export const DEFAULT_COST_PER_1K_TOKENS = 0.01;

/**
 * Tokens → USD at a per-1K rate.
 *
 * Extracted because three sites had `tokensUsed * 0.00001` inline
 * (`state-manager.ts`, and twice in `puppeteer-helpers.ts`), which is the
 * per-token form of the 0.01-per-1K default. Being numerically identical to the
 * default is exactly why `costPer1KTokens` could be declared, defaulted and
 * Zod-validated while never being read — nothing looked wrong.
 *
 * This is a subsystem-local rate applied to a caller-supplied number, NOT a
 * registry lookup: it deliberately does not become a twelfth entry in the
 * token→USD inventory under #5122. When that consolidation lands, this is the
 * one place this subsystem needs to change.
 */
export function tokensToCostUsd(tokens: number, costPer1KTokens: number): number {
  return (tokens * costPer1KTokens) / 1000;
}

/** Default configuration values. */
export const DEFAULT_PUPPETEER_CONFIG: Required<PuppeteerConfig> = {
  maxSteps: 10,
  timeoutMs: 5 * 60 * 1000, // 5 minutes
  policyMode: 'rule_based',
  discountFactor: 0.99,
  explorationRate: 0.1,
  trackEmergentPatterns: true,
  costPer1KTokens: DEFAULT_COST_PER_1K_TOKENS,
  maxCostBudget: 1.0,
};

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
