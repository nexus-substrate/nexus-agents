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

import type {
  Result,
  Task,
  TaskResult,
  AgentCapability,
  CompletionRequest,
  Message,
} from '../../core/index.js';
import { ok, err, AgentError } from '../../core/index.js';
import { BaseAgent, type BaseAgentOptions } from '../base-agent.js';
import {
  type ExpertOptions,
  type CodeAnalysisResult,
  EXPERT_DEFAULT_TEMPERATURES,
  EXPERT_DEFAULT_CAPABILITIES,
} from './expert-types.js';

/**
 * System prompt for the CodeExpert agent.
 */
const CODE_EXPERT_SYSTEM_PROMPT = `You are a senior software engineer expert specializing in code generation, refactoring, optimization, and debugging.

## Core Principles
1. Write clean, maintainable, and well-documented code
2. Follow SOLID principles and established design patterns
3. Prioritize readability over cleverness
4. Consider edge cases and error handling
5. Include appropriate type annotations

## Output Format
Respond with JSON matching this structure:
{
  "content": "Summary of what was done",
  "operationType": "generation" | "refactoring" | "optimization" | "debugging",
  "codeChanges": [
    {
      "file": "path/to/file.ts",
      "modified": "// new or modified code",
      "description": "What this change does"
    }
  ],
  "recommendations": ["Suggestion 1", "Suggestion 2"],
  "warnings": ["Warning 1"],
  "confidence": 0.0-1.0
}

## Guidelines
- For code generation: Create complete, working implementations
- For refactoring: Preserve functionality while improving structure
- For optimization: Measure before and after, document trade-offs
- For debugging: Identify root cause, not just symptoms`;

/**
 * Configuration options for CodeExpert.
 */
export interface CodeExpertOptions extends ExpertOptions {
  /** Enable strict type checking recommendations */
  strictTypes?: boolean;
  /** Preferred code style (if applicable) */
  codeStyle?: 'functional' | 'object-oriented' | 'mixed';
  /** Target language for code generation */
  targetLanguage?: string;
}

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
    const startTime = Date.now();
    const operationType = this.inferOperationType(task.description);

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
        durationMs: Date.now() - startTime,
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
    const result = this.parseCodeResult(textContent, operationType);

    return ok({
      taskId: task.id,
      output: result,
      metadata: {
        durationMs: Date.now() - startTime,
        tokensUsed: response.usage.totalTokens,
        toolsUsed: [],
        model: response.model,
      },
    });
  }

  /**
   * Infer the operation type from task description.
   */
  private inferOperationType(description: string): CodeAnalysisResult['operationType'] {
    const desc = description.toLowerCase();

    if (desc.includes('debug') || desc.includes('fix bug') || desc.includes('error')) {
      return 'debugging';
    }
    if (desc.includes('optimize') || desc.includes('performance') || desc.includes('faster')) {
      return 'optimization';
    }
    if (desc.includes('refactor') || desc.includes('clean') || desc.includes('restructure')) {
      return 'refactoring';
    }
    return 'generation';
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
    const recommendations = this.generateHeuristicRecommendations(operationType);
    const warnings = this.detectHeuristicWarnings(task.description);

    return {
      content: `Heuristic analysis for ${operationType} task. Model adapter required for detailed code generation.`,
      operationType,
      recommendations,
      warnings,
      confidence: 0.4,
    };
  }

  /**
   * Generate recommendations based on operation type.
   */
  private generateHeuristicRecommendations(
    operationType: CodeAnalysisResult['operationType']
  ): string[] {
    const baseRecs = ['Consider adding unit tests', 'Document public interfaces'];

    switch (operationType) {
      case 'generation':
        return [...baseRecs, 'Follow project coding standards', 'Use TypeScript strict mode'];
      case 'refactoring':
        return [...baseRecs, 'Ensure tests pass before and after', 'Make incremental changes'];
      case 'optimization':
        return [...baseRecs, 'Benchmark before optimizing', 'Document trade-offs'];
      case 'debugging':
        return [...baseRecs, 'Add regression test for the bug', 'Check for similar issues'];
      default:
        return baseRecs;
    }
  }

  /**
   * Detect potential warnings from task description.
   */
  private detectHeuristicWarnings(description: string): string[] {
    const warnings: string[] = [];
    const desc = description.toLowerCase();

    if (desc.includes('database') || desc.includes('sql')) {
      warnings.push('Database changes may require migration');
    }
    if (desc.includes('api') || desc.includes('endpoint')) {
      warnings.push('API changes may be breaking');
    }
    if (desc.includes('security') || desc.includes('auth')) {
      warnings.push('Security-sensitive code requires careful review');
    }
    if (desc.includes('concurrent') || desc.includes('async')) {
      warnings.push('Concurrency requires careful error handling');
    }

    return warnings;
  }

  /**
   * Parse code result from model response.
   */
  private parseCodeResult(
    text: string,
    defaultType: CodeAnalysisResult['operationType']
  ): CodeAnalysisResult {
    try {
      const jsonText = this.extractJsonFromText(text);
      const parsed = JSON.parse(jsonText) as Partial<CodeAnalysisResult>;

      const result: CodeAnalysisResult = {
        content: parsed.content ?? 'Code analysis completed',
        operationType: parsed.operationType ?? defaultType,
        confidence: parsed.confidence ?? 0.7,
      };
      if (parsed.affectedFiles !== undefined) {
        result.affectedFiles = parsed.affectedFiles;
      }
      if (parsed.codeChanges !== undefined) {
        result.codeChanges = parsed.codeChanges;
      }
      if (parsed.recommendations !== undefined) {
        result.recommendations = parsed.recommendations;
      }
      if (parsed.warnings !== undefined) {
        result.warnings = parsed.warnings;
      }
      return result;
    } catch {
      // Fall back to treating the whole response as content
      return {
        content: text,
        operationType: defaultType,
        confidence: 0.5,
      };
    }
  }

  /**
   * Extract JSON from text that may contain markdown code blocks.
   */
  private extractJsonFromText(text: string): string {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    return match?.[1]?.trim() ?? text.trim();
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

// ============================================================================
// Helper Functions
// ============================================================================

function buildCodeExpertBaseOptions(
  options: Partial<BaseAgentOptions>,
  expertOpts: CodeExpertOptions
): BaseAgentOptions {
  const temperature = expertOpts.temperature ?? EXPERT_DEFAULT_TEMPERATURES.code;
  const baseCapabilities = EXPERT_DEFAULT_CAPABILITIES.code_expert;
  const additionalCaps = expertOpts.additionalCapabilities ?? [];

  const baseOptions: BaseAgentOptions = {
    id: options.id ?? 'code-expert',
    role: 'code_expert',
    capabilities: [...baseCapabilities, ...additionalCaps] as AgentCapability[],
    temperature,
    maxTokens: options.maxTokens ?? 8192,
    systemPrompt: expertOpts.systemPromptOverride ?? CODE_EXPERT_SYSTEM_PROMPT,
  };

  if (options.adapter !== undefined) baseOptions.adapter = options.adapter;
  if (options.logger !== undefined) baseOptions.logger = options.logger;

  return baseOptions;
}

/**
 * Creates a new CodeExpert agent with the given options.
 */
export function createCodeExpert(
  options?: Partial<BaseAgentOptions> & { expertOptions?: CodeExpertOptions }
): CodeExpert {
  return new CodeExpert(options);
}
