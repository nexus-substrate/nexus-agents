/**
 * nexus-agents/agents - SecurityExpert
 *
 * Expert agent specialized in security review, vulnerability detection,
 * and security hardening. Uses temperature 0.3 for precise analysis.
 */

import type {
  Result,
  Task,
  TaskResult,
  AgentCapability,
  CompletionRequest,
  Message,
} from '../../core/index.js';
import { ok, err, AgentError, getTimeProvider } from '../../core/index.js';
import { BaseAgent, type BaseAgentOptions } from '../base-agent.js';
import {
  type ExpertOptions,
  type SecurityAnalysisResult,
  type Vulnerability,
  VulnerabilitySchema,
  EXPERT_DEFAULT_TEMPERATURES,
  EXPERT_DEFAULT_CAPABILITIES,
} from './expert-types.js';
import { SECURITY_EXPERT_SYSTEM_PROMPT } from './expert-prompts.js';
import { getSecurityKnowledgePrompt } from './knowledge/security/index.js';
import {
  detectHeuristicVulnerabilities,
  calculateSecurityScore,
  generateHeuristicRecommendations,
  generateSecurityWarnings,
  parseSecurityResult,
} from './security-expert-helpers.js';

/**
 * Configuration options for SecurityExpert.
 */
export interface SecurityExpertOptions extends ExpertOptions {
  /** Compliance frameworks to check */
  complianceFrameworks?: string[];
  /** Minimum severity to report */
  minSeverity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Enable detailed CWE mappings */
  enableCweMapping?: boolean;
  /** Security focus areas */
  focusAreas?: SecurityFocusArea[];
}

/**
 * Security focus areas for targeted analysis.
 */
export type SecurityFocusArea =
  | 'authentication'
  | 'authorization'
  | 'input_validation'
  | 'cryptography'
  | 'injection'
  | 'secrets'
  | 'dependencies';

/**
 * SecurityExpert - Expert agent for security-related tasks.
 */
export class SecurityExpert extends BaseAgent {
  private readonly expertOptions: SecurityExpertOptions;

  constructor(options: Partial<BaseAgentOptions> & { expertOptions?: SecurityExpertOptions } = {}) {
    const expertOpts = options.expertOptions ?? {};
    const baseOptions = buildBaseOptions(options, expertOpts);

    super(baseOptions);
    this.expertOptions = expertOpts;
  }

  protected async executeTask(task: Task): Promise<Result<TaskResult, AgentError>> {
    const startTime = getTimeProvider().now();

    this.logger.info('Executing security task', {
      taskId: task.id,
      focusAreas: this.expertOptions.focusAreas,
      hasAdapter: this.adapter !== undefined,
    });

    if (this.adapter === undefined) {
      return this.executeHeuristic(task, startTime);
    }

    return this.executeWithModel(task, startTime);
  }

  protected buildPrompt(task: Task): Message[] {
    const contextInfo = this.buildContextInfo(task);

    return [
      {
        role: 'user',
        content: `${contextInfo}

## Security Review Task
${task.description}

Analyze for security vulnerabilities and provide findings in the specified JSON format.`,
      },
    ];
  }

  getExpertOptions(): Readonly<SecurityExpertOptions> {
    return { ...this.expertOptions };
  }

  private executeHeuristic(task: Task, startTime: number): Result<TaskResult, AgentError> {
    const vulnerabilities = detectHeuristicVulnerabilities(task.description, {
      enableCweMapping: this.expertOptions.enableCweMapping,
      minSeverity: this.expertOptions.minSeverity,
    });
    const securityScore = calculateSecurityScore(vulnerabilities);

    const result: SecurityAnalysisResult = {
      content: 'Heuristic security analysis. Model adapter required for comprehensive review.',
      vulnerabilities,
      securityScore,
      recommendations: generateHeuristicRecommendations(vulnerabilities),
      warnings: generateSecurityWarnings(vulnerabilities),
      confidence: 0.4,
    };

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

  private async executeWithModel(
    task: Task,
    startTime: number
  ): Promise<Result<TaskResult, AgentError>> {
    const messages = this.buildPrompt(task);

    const request: CompletionRequest = {
      messages,
      systemPrompt: this.systemPrompt ?? SECURITY_EXPERT_SYSTEM_PROMPT,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    };

    const completionResult = await this.complete(request);
    if (!completionResult.ok) {
      return err(completionResult.error);
    }

    const response = completionResult.value;
    const textContent = this.extractTextContent(response.content);
    const validator = (v: unknown): { success: boolean; data?: Vulnerability } => {
      const parsed = VulnerabilitySchema.safeParse(v);
      return parsed.success
        ? { success: true, data: parsed.data as Vulnerability }
        : { success: false };
    };
    const result = parseSecurityResult(textContent, calculateSecurityScore, validator);

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

  private buildContextInfo(task: Task): string {
    const parts: string[] = [];

    if (task.context.files !== undefined && task.context.files.length > 0) {
      parts.push(`Files to Review:\n${task.context.files.map((f) => `- ${f}`).join('\n')}`);
    }

    if (this.expertOptions.focusAreas !== undefined && this.expertOptions.focusAreas.length > 0) {
      parts.push(`Focus Areas: ${this.expertOptions.focusAreas.join(', ')}`);
    }

    if (
      this.expertOptions.complianceFrameworks !== undefined &&
      this.expertOptions.complianceFrameworks.length > 0
    ) {
      parts.push(`Compliance Frameworks: ${this.expertOptions.complianceFrameworks.join(', ')}`);
    }

    if (this.expertOptions.minSeverity !== undefined) {
      parts.push(`Minimum Severity: ${this.expertOptions.minSeverity}`);
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
  expertOpts: SecurityExpertOptions
): BaseAgentOptions {
  const temperature = expertOpts.temperature ?? EXPERT_DEFAULT_TEMPERATURES.security;
  const baseCapabilities = EXPERT_DEFAULT_CAPABILITIES.security_expert;
  const additionalCaps = expertOpts.additionalCapabilities ?? [];

  const baseOptions: BaseAgentOptions = {
    id: options.id ?? 'security-expert',
    role: 'security_expert',
    capabilities: [...baseCapabilities, ...additionalCaps] as AgentCapability[],
    temperature,
    maxTokens: options.maxTokens ?? 8192,
    systemPrompt:
      expertOpts.systemPromptOverride ??
      `${SECURITY_EXPERT_SYSTEM_PROMPT}\n\n${getSecurityKnowledgePrompt()}`,
  };

  if (options.adapter !== undefined) baseOptions.adapter = options.adapter;
  if (options.logger !== undefined) baseOptions.logger = options.logger;

  return baseOptions;
}

export function createSecurityExpert(
  options?: Partial<BaseAgentOptions> & { expertOptions?: SecurityExpertOptions }
): SecurityExpert {
  return new SecurityExpert(options);
}
