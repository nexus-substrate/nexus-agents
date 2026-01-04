/**
 * nexus-agents/agents - ArchitectureExpert
 *
 * Expert agent specialized in system design, design patterns,
 * and architecture decisions. Uses temperature 0.5 for balanced creativity.
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
  type ArchitectureAnalysisResult,
  EXPERT_DEFAULT_TEMPERATURES,
  EXPERT_DEFAULT_CAPABILITIES,
} from './expert-types.js';
import { ARCHITECTURE_EXPERT_SYSTEM_PROMPT } from './expert-prompts.js';
import {
  identifyHeuristicPatterns,
  identifyHeuristicComponents,
  generateHeuristicADRs,
  inferAnalysisType,
  generateHeuristicRecommendations,
  detectArchitectureWarnings,
  parseArchitectureResult,
} from './architecture-expert-helpers.js';

/**
 * Configuration options for ArchitectureExpert.
 */
export interface ArchitectureExpertOptions extends ExpertOptions {
  /** Preferred architecture styles */
  preferredStyles?: ArchitectureStyle[];
  /** Generate ADRs automatically */
  generateADRs?: boolean;
  /** Include C4 diagram suggestions */
  includeC4Suggestions?: boolean;
  /** Quality attributes to prioritize */
  qualityPriorities?: QualityAttribute[];
}

/**
 * Architecture style options.
 */
export type ArchitectureStyle =
  | 'layered'
  | 'microservices'
  | 'event_driven'
  | 'hexagonal'
  | 'clean'
  | 'cqrs'
  | 'ddd';

/**
 * Quality attributes for architecture decisions.
 */
export type QualityAttribute =
  | 'performance'
  | 'scalability'
  | 'maintainability'
  | 'security'
  | 'reliability'
  | 'testability';

/**
 * ArchitectureExpert - Expert agent for architecture-related tasks.
 */
export class ArchitectureExpert extends BaseAgent {
  private readonly expertOptions: ArchitectureExpertOptions;

  constructor(
    options: Partial<BaseAgentOptions> & { expertOptions?: ArchitectureExpertOptions } = {}
  ) {
    const expertOpts = options.expertOptions ?? {};
    const baseOptions = buildBaseOptions(options, expertOpts);

    super(baseOptions);
    this.expertOptions = expertOpts;
  }

  protected async executeTask(task: Task): Promise<Result<TaskResult, AgentError>> {
    const startTime = Date.now();
    const analysisType = inferAnalysisType(task.description);

    this.logger.info('Executing architecture task', {
      taskId: task.id,
      analysisType,
      preferredStyles: this.expertOptions.preferredStyles,
      hasAdapter: this.adapter !== undefined,
    });

    if (this.adapter === undefined) {
      return this.executeHeuristic(task, analysisType, startTime);
    }

    return this.executeWithModel(task, analysisType, startTime);
  }

  protected buildPrompt(task: Task): Message[] {
    const contextInfo = this.buildContextInfo(task);

    return [
      {
        role: 'user',
        content: `${contextInfo}

## Architecture Task
${task.description}

Analyze and provide your architectural recommendations in the specified JSON format.`,
      },
    ];
  }

  getExpertOptions(): Readonly<ArchitectureExpertOptions> {
    return { ...this.expertOptions };
  }

  private executeHeuristic(
    task: Task,
    analysisType: ArchitectureAnalysisResult['analysisType'],
    startTime: number
  ): Result<TaskResult, AgentError> {
    const patterns = identifyHeuristicPatterns(task.description);
    const components = identifyHeuristicComponents(task.description);
    const decisions =
      this.expertOptions.generateADRs === true ? generateHeuristicADRs(task, patterns) : undefined;

    const result: ArchitectureAnalysisResult = {
      content: `Heuristic architecture analysis for ${analysisType}. Model adapter recommended.`,
      analysisType,
      patterns,
      components,
      decisions,
      recommendations: generateHeuristicRecommendations(analysisType),
      warnings: detectArchitectureWarnings(task.description),
      confidence: 0.4,
    };

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

  private async executeWithModel(
    task: Task,
    analysisType: ArchitectureAnalysisResult['analysisType'],
    startTime: number
  ): Promise<Result<TaskResult, AgentError>> {
    const messages = this.buildPrompt(task);

    const request: CompletionRequest = {
      messages,
      systemPrompt: this.systemPrompt ?? ARCHITECTURE_EXPERT_SYSTEM_PROMPT,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    };

    const completionResult = await this.complete(request);
    if (!completionResult.ok) {
      return err(completionResult.error);
    }

    const response = completionResult.value;
    const textContent = this.extractTextContent(response.content);
    const result = parseArchitectureResult(textContent, analysisType);

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

  private buildContextInfo(task: Task): string {
    const parts: string[] = [];

    if (task.context.workingDirectory !== undefined) {
      parts.push(`Project: ${task.context.workingDirectory}`);
    }

    if (task.context.files !== undefined && task.context.files.length > 0) {
      parts.push(`Relevant Files:\n${task.context.files.map((f) => `- ${f}`).join('\n')}`);
    }

    if (this.expertOptions.preferredStyles !== undefined) {
      parts.push(`Preferred Styles: ${this.expertOptions.preferredStyles.join(', ')}`);
    }

    if (this.expertOptions.qualityPriorities !== undefined) {
      parts.push(`Quality Priorities: ${this.expertOptions.qualityPriorities.join(', ')}`);
    }

    if (this.expertOptions.includeC4Suggestions === true) {
      parts.push('Note: Include C4 diagram suggestions');
    }

    return parts.length > 0 ? `## Context\n${parts.join('\n')}\n` : '';
  }

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

function buildBaseOptions(
  options: Partial<BaseAgentOptions>,
  expertOpts: ArchitectureExpertOptions
): BaseAgentOptions {
  const temperature = expertOpts.temperature ?? EXPERT_DEFAULT_TEMPERATURES.architecture;
  const baseCapabilities = EXPERT_DEFAULT_CAPABILITIES.architecture_expert;
  const additionalCaps = expertOpts.additionalCapabilities ?? [];

  const baseOptions: BaseAgentOptions = {
    id: options.id ?? 'architecture-expert',
    role: 'architecture_expert',
    capabilities: [...baseCapabilities, ...additionalCaps] as AgentCapability[],
    temperature,
    maxTokens: options.maxTokens ?? 8192,
    systemPrompt: expertOpts.systemPromptOverride ?? ARCHITECTURE_EXPERT_SYSTEM_PROMPT,
  };

  if (options.adapter !== undefined) baseOptions.adapter = options.adapter;
  if (options.logger !== undefined) baseOptions.logger = options.logger;

  return baseOptions;
}

export function createArchitectureExpert(
  options?: Partial<BaseAgentOptions> & { expertOptions?: ArchitectureExpertOptions }
): ArchitectureExpert {
  return new ArchitectureExpert(options);
}
