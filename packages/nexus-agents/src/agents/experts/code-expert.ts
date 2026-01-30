/**
 * nexus-agents/agents - CodeExpert
 *
 * Expert agent specialized in code generation, refactoring, optimization,
 * and debugging. Uses low temperature (0.2-0.3) for precise code output.
 *
 * Capabilities:
 * - code_generation: Generate new code from specifications
 * - refactoring: Improve existing code structure
 * - optimization: Enhance performance
 * - debugging: Identify and fix bugs
 */

import type { Result, Task, TaskResult, CompletionRequest, Message } from '../../core/index.js';
import { ok, err, AgentError, getTimeProvider } from '../../core/index.js';
import { BaseAgent, type BaseAgentOptions } from '../base-agent.js';
import type { CodeAnalysisResult } from './expert-types.js';
import {
  type CodeExpertOptions,
  CODE_EXPERT_SYSTEM_PROMPT,
  buildCodeExpertBaseOptions,
  inferOperationType,
  generateHeuristicRecommendations,
  detectHeuristicWarnings,
  parseCodeResult,
} from './code-expert-helpers.js';

// Re-export types for backward compatibility
export type { CodeExpertOptions } from './code-expert-helpers.js';

/**
 * CodeExpert - Expert agent for code-related tasks.
 *
 * Specialized in:
 * - Code generation from specifications
 * - Code refactoring and cleanup
 * - Performance optimization
 * - Bug detection and debugging
 */
export class CodeExpert extends BaseAgent {
  private readonly expertOptions: CodeExpertOptions;

  constructor(options: Partial<BaseAgentOptions> & { expertOptions?: CodeExpertOptions } = {}) {
    const expertOpts = options.expertOptions ?? {};
    const baseOptions = buildCodeExpertBaseOptions(options, expertOpts);

    super(baseOptions);
    this.expertOptions = expertOpts;
  }

  /**
   * Execute a code-related task.
   */
  protected async executeTask(task: Task): Promise<Result<TaskResult, AgentError>> {
    const startTime = getTimeProvider().now();
    const operationType = inferOperationType(task.description);

    this.logger.info('Executing code task', {
      taskId: task.id,
      operationType,
      hasAdapter: this.adapter !== undefined,
    });

    // If no adapter, use heuristic analysis
    if (this.adapter === undefined) {
      return this.executeHeuristic(task, operationType, startTime);
    }

    // Use model for code analysis
    return this.executeWithModel(task, operationType, startTime);
  }

  /**
   * Build prompt messages for the task.
   */
  protected buildPrompt(task: Task): Message[] {
    const contextInfo = this.buildContextInfo(task);

    return [
      {
        role: 'user',
        content: `${contextInfo}

## Task
${task.description}

Please analyze and provide your response in the JSON format specified.`,
      },
    ];
  }

  /**
   * Get the expert options.
   */
  getExpertOptions(): Readonly<CodeExpertOptions> {
    return { ...this.expertOptions };
  }

  /**
   * Execute task with heuristic analysis (no model).
   */
  private executeHeuristic(
    task: Task,
    operationType: CodeAnalysisResult['operationType'],
    startTime: number
  ): Result<TaskResult, AgentError> {
    const result = this.createHeuristicResult(task, operationType);

    return ok({
      taskId: task.id,
      output: result,
      metadata: {
        durationMs: getTimeProvider().now() - startTime,
        tokensUsed: 0,
        toolsUsed: [],
        model: 'heuristic',
      },
    });
  }

  /**
   * Execute task with model adapter.
   */
  private async executeWithModel(
    task: Task,
    operationType: CodeAnalysisResult['operationType'],
    startTime: number
  ): Promise<Result<TaskResult, AgentError>> {
    const messages = this.buildPrompt(task);

    const request: CompletionRequest = {
      messages,
      systemPrompt: this.systemPrompt ?? CODE_EXPERT_SYSTEM_PROMPT,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    };

    const completionResult = await this.complete(request);
    if (!completionResult.ok) {
      return err(completionResult.error);
    }

    const response = completionResult.value;
    const textContent = this.extractTextContent(response.content);
    const result = parseCodeResult(textContent, operationType);

    return ok({
      taskId: task.id,
      output: result,
      metadata: {
        durationMs: getTimeProvider().now() - startTime,
        tokensUsed: response.usage.totalTokens,
        toolsUsed: [],
        model: response.model,
      },
    });
  }

  /**
   * Build context information from task.
   */
  private buildContextInfo(task: Task): string {
    const parts: string[] = [];

    if (task.context.workingDirectory !== undefined) {
      parts.push(`Working Directory: ${task.context.workingDirectory}`);
    }

    if (task.context.files !== undefined && task.context.files.length > 0) {
      parts.push(`Relevant Files:\n${task.context.files.map((f) => `- ${f}`).join('\n')}`);
    }

    if (this.expertOptions.targetLanguage !== undefined) {
      parts.push(`Target Language: ${this.expertOptions.targetLanguage}`);
    }

    if (this.expertOptions.codeStyle !== undefined) {
      parts.push(`Code Style: ${this.expertOptions.codeStyle}`);
    }

    if (this.expertOptions.strictTypes === true) {
      parts.push('Note: Strict type checking is enabled');
    }

    return parts.length > 0 ? `## Context\n${parts.join('\n')}\n` : '';
  }

  /**
   * Create a heuristic result without model.
   */
  private createHeuristicResult(
    task: Task,
    operationType: CodeAnalysisResult['operationType']
  ): CodeAnalysisResult {
    const recommendations = generateHeuristicRecommendations(operationType);
    const warnings = detectHeuristicWarnings(task.description);

    return {
      content: `Heuristic analysis for ${operationType} task. Model adapter required for detailed code generation.`,
      operationType,
      recommendations,
      warnings,
      confidence: 0.4,
    };
  }

  /**
   * Extract text content from completion response.
   */
  private extractTextContent(content: Array<{ type: string; text?: string }>): string {
    return content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  }
}

/**
 * Creates a new CodeExpert agent with the given options.
 */
export function createCodeExpert(
  options?: Partial<BaseAgentOptions> & { expertOptions?: CodeExpertOptions }
): CodeExpert {
  return new CodeExpert(options);
}
