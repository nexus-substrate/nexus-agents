/**
 * Puppeteer State Manager
 *
 * Manages global state aggregation and updates for Puppeteer orchestration.
 * Implements state transition function: S_{t+1} = Phi(S_t, o_t)
 *
 * @module agents/orchestration/state-manager
 * (Source: Issue #335, arXiv:2505.19591)
 */

import type { Task } from '../../core/index.js';
import type { PuppeteerState, PuppeteerStateMetadata, AgentStepOutput } from './puppeteer-types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for state manager.
 */
export interface StateManagerConfig {
  /** Maximum context size in tokens (approximate) */
  readonly maxContextTokens?: number;
  /** Compression threshold (percentage of max before compressing) */
  readonly compressionThreshold?: number;
  /** Characters per token estimate */
  readonly charsPerToken?: number;
}

/** Default state manager configuration. */
export const DEFAULT_STATE_MANAGER_CONFIG: Required<StateManagerConfig> = {
  maxContextTokens: 8000,
  compressionThreshold: 0.8,
  charsPerToken: 4,
};

/**
 * Interface for state manager.
 */
export interface IStateManager {
  /** Create initial state for a task. */
  createInitialState(task: Task, sessionId: string, initialContext?: string): PuppeteerState;

  /** Update state after agent execution. */
  updateState(currentState: PuppeteerState, agentOutput: AgentStepOutput): PuppeteerState;

  /** Extract context relevant for a specific agent. */
  extractAgentContext(state: PuppeteerState, agentId: string): string;

  /** Compress state to fit within context limits. */
  compressState(state: PuppeteerState): PuppeteerState;

  /** Estimate progress toward task completion. */
  estimateProgress(state: PuppeteerState): number;

  /** Estimate token count for a string. */
  estimateTokens(text: string): number;
}

// =============================================================================
// State Manager Implementation
// =============================================================================

/**
 * State manager for Puppeteer orchestration.
 */
export class StateManager implements IStateManager {
  private readonly config: Required<StateManagerConfig>;

  constructor(config: StateManagerConfig = {}) {
    this.config = { ...DEFAULT_STATE_MANAGER_CONFIG, ...config };
  }

  /**
   * Create initial state for a task.
   */
  createInitialState(task: Task, sessionId: string, initialContext?: string): PuppeteerState {
    const now = new Date().toISOString();
    return {
      step: 0,
      task,
      agentOutputs: [],
      context: initialContext ?? this.buildInitialContext(task),
      metadata: {
        progress: 0,
        totalCost: 0,
        totalTokens: 0,
        elapsedMs: 0,
        startedAt: now,
      },
      sessionId,
    };
  }

  /**
   * Update state after agent execution.
   * Implements: S_{t+1} = Phi(S_t, o_t)
   */
  updateState(currentState: PuppeteerState, agentOutput: AgentStepOutput): PuppeteerState {
    const newOutputs = [...currentState.agentOutputs, agentOutput];
    const newMetadata = this.updateMetadata(currentState.metadata, agentOutput);

    // Build new context by appending agent output
    let newContext = this.appendToContext(currentState.context, agentOutput);

    // Compress if needed
    const estimatedTokens = this.estimateTokens(newContext);
    const threshold = this.config.maxContextTokens * this.config.compressionThreshold;
    if (estimatedTokens > threshold) {
      newContext = this.compressContext(newContext, newOutputs);
    }

    return {
      step: currentState.step + 1,
      task: currentState.task,
      agentOutputs: newOutputs,
      context: newContext,
      metadata: {
        ...newMetadata,
        progress: this.estimateProgressFromOutputs(newOutputs, currentState.task),
      },
      sessionId: currentState.sessionId,
    };
  }

  /**
   * Extract context relevant for a specific agent.
   */
  extractAgentContext(state: PuppeteerState, agentId: string): string {
    const parts: string[] = [`Task: ${state.task.description}`, '', 'Previous Steps:'];

    // Include relevant previous outputs
    for (const output of state.agentOutputs) {
      const relevance = this.computeRelevance(output, agentId);
      if (relevance > 0.5) {
        parts.push(`[Step ${String(output.step)}] ${output.agentId}:`);
        parts.push(this.truncateOutput(output.output, 500));
        parts.push('');
      }
    }

    // Include current context summary
    parts.push('Current Context:');
    parts.push(this.summarizeContext(state.context, 1000));

    return parts.join('\n');
  }

  /**
   * Compress state to fit within context limits.
   */
  compressState(state: PuppeteerState): PuppeteerState {
    const compressedContext = this.compressContext(state.context, state.agentOutputs);
    return {
      ...state,
      context: compressedContext,
    };
  }

  /**
   * Estimate progress toward task completion.
   */
  estimateProgress(state: PuppeteerState): number {
    return this.estimateProgressFromOutputs(state.agentOutputs, state.task);
  }

  /**
   * Estimate token count for a string.
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / this.config.charsPerToken);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private buildInitialContext(task: Task): string {
    const parts: string[] = [`Task: ${task.description}`];

    if (task.context.workingDirectory !== undefined && task.context.workingDirectory !== '') {
      parts.push(`Working Directory: ${task.context.workingDirectory}`);
    }

    if (task.context.files !== undefined && task.context.files.length > 0) {
      parts.push(`Relevant Files: ${task.context.files.join(', ')}`);
    }

    if (task.constraints !== undefined) {
      parts.push('Constraints:');
      if (task.constraints.maxDuration !== undefined && task.constraints.maxDuration !== 0) {
        parts.push(`  - Max Duration: ${String(task.constraints.maxDuration)}ms`);
      }
      if (task.constraints.maxTokens !== undefined && task.constraints.maxTokens !== 0) {
        parts.push(`  - Max Tokens: ${String(task.constraints.maxTokens)}`);
      }
    }

    return parts.join('\n');
  }

  private updateMetadata(
    current: PuppeteerStateMetadata,
    output: AgentStepOutput
  ): PuppeteerStateMetadata {
    const startTime = new Date(current.startedAt).getTime();
    const elapsedMs = Date.now() - startTime;
    const costPerToken = 0.00001; // $0.01 per 1K tokens

    return {
      progress: current.progress,
      totalCost: current.totalCost + output.tokensUsed * costPerToken,
      totalTokens: current.totalTokens + output.tokensUsed,
      elapsedMs,
      startedAt: current.startedAt,
    };
  }

  private appendToContext(context: string, output: AgentStepOutput): string {
    const outputStr = this.formatOutput(output);
    return `${context}\n\n---\n[Step ${String(output.step)}] ${output.agentId}:\n${outputStr}`;
  }

  private formatOutput(output: AgentStepOutput): string {
    if (typeof output.output === 'string') {
      return output.output;
    }
    return JSON.stringify(output.output, null, 2);
  }

  private compressContext(context: string, outputs: readonly AgentStepOutput[]): string {
    // Strategy: Keep task description, summarize middle steps, keep recent steps
    const lines = context.split('\n');
    const taskSection = lines.slice(0, 5).join('\n');

    // Summarize older outputs
    const recentCount = 3;
    const olderOutputs = outputs.slice(0, -recentCount);
    const recentOutputs = outputs.slice(-recentCount);

    const parts: string[] = [taskSection, '', '=== Summary of Earlier Steps ==='];

    if (olderOutputs.length > 0) {
      for (const output of olderOutputs) {
        const summary = this.summarizeOutput(output);
        parts.push(`[Step ${String(output.step)}] ${output.agentId}: ${summary}`);
      }
    } else {
      parts.push('(No earlier steps)');
    }

    parts.push('', '=== Recent Steps ===');
    for (const output of recentOutputs) {
      parts.push(`[Step ${String(output.step)}] ${output.agentId}:`);
      parts.push(this.truncateOutput(output.output, 1000));
      parts.push('');
    }

    return parts.join('\n');
  }

  private summarizeOutput(output: AgentStepOutput): string {
    const str = this.formatOutput(output);
    const maxLen = 100;
    if (str.length <= maxLen) {
      return str.replace(/\n/g, ' ');
    }
    return str.substring(0, maxLen - 3).replace(/\n/g, ' ') + '...';
  }

  private truncateOutput(output: unknown, maxLen: number): string {
    const str = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
    if (str.length <= maxLen) {
      return str;
    }
    return str.substring(0, maxLen - 3) + '...';
  }

  private summarizeContext(context: string, maxLen: number): string {
    if (context.length <= maxLen) {
      return context;
    }
    return context.substring(0, maxLen - 3) + '...';
  }

  private computeRelevance(_output: AgentStepOutput, _agentId: string): number {
    // Simple recency-based relevance for now
    // Future: Use semantic similarity or learned relevance
    return 1.0;
  }

  private estimateProgressFromOutputs(outputs: readonly AgentStepOutput[], task: Task): number {
    if (outputs.length === 0) {
      return 0;
    }

    // Heuristic progress estimation based on:
    // 1. Number of steps taken
    // 2. Presence of completion indicators
    // 3. Task complexity estimate

    const stepProgress = Math.min(outputs.length / 10, 0.5);

    // Check for completion indicators in recent outputs
    const recentOutput = outputs[outputs.length - 1];
    if (recentOutput === undefined) return stepProgress;
    const outputStr = this.formatOutput(recentOutput);
    const completionIndicators = ['complete', 'done', 'finished', 'success', 'final', 'verified'];

    let completionBonus = 0;
    for (const indicator of completionIndicators) {
      if (outputStr.toLowerCase().includes(indicator)) {
        completionBonus = 0.3;
        break;
      }
    }

    // Estimate task complexity from description length
    const taskComplexity = Math.min(task.description.length / 1000, 1);
    const complexityFactor = 1 - taskComplexity * 0.2;

    const progress = Math.min((stepProgress + completionBonus) * complexityFactor, 1);
    return Math.round(progress * 100) / 100;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a state manager instance.
 */
export function createStateManager(config?: StateManagerConfig): IStateManager {
  return new StateManager(config);
}
