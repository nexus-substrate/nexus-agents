/**
 * nexus-agents/agents - DocumentationExpert
 *
 * Expert agent specialized in documentation generation, API documentation,
 * and README creation. Uses temperature 0.4 for clear yet engaging content.
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
  type DocumentationResult,
  EXPERT_DEFAULT_TEMPERATURES,
  EXPERT_DEFAULT_CAPABILITIES,
} from './expert-types.js';
import { DOCUMENTATION_EXPERT_SYSTEM_PROMPT } from './expert-prompts.js';
import {
  generateHeuristicSections,
  generateHeuristicContent,
  generateHeuristicRecommendations,
  detectDocumentationWarnings,
  inferDocumentationType,
} from './documentation-expert-helpers.js';

/**
 * Configuration options for DocumentationExpert.
 */
export interface DocumentationExpertOptions extends ExpertOptions {
  /** Documentation format */
  format?: 'markdown' | 'jsdoc' | 'tsdoc' | 'rst';
  /** Include code examples */
  includeExamples?: boolean;
  /** Target audience level */
  audienceLevel?: 'beginner' | 'intermediate' | 'advanced';
  /** Generate table of contents */
  generateTOC?: boolean;
  /** Include badges in README */
  includeBadges?: boolean;
}

/**
 * DocumentationExpert - Expert agent for documentation-related tasks.
 */
export class DocumentationExpert extends BaseAgent {
  private readonly expertOptions: DocumentationExpertOptions;

  constructor(
    options: Partial<BaseAgentOptions> & { expertOptions?: DocumentationExpertOptions } = {}
  ) {
    const expertOpts = options.expertOptions ?? {};
    const baseOptions = buildBaseOptions(options, expertOpts);

    super(baseOptions);
    this.expertOptions = expertOpts;
  }

  protected async executeTask(task: Task): Promise<Result<TaskResult, AgentError>> {
    const startTime = getTimeProvider().now();
    const docType = inferDocumentationType(task.description);

    this.logger.info('Executing documentation task', {
      taskId: task.id,
      documentationType: docType,
      format: this.expertOptions.format,
      hasAdapter: this.adapter !== undefined,
    });

    if (this.adapter === undefined) {
      return this.executeHeuristic(task, docType, startTime);
    }

    return this.executeWithModel(task, docType, startTime);
  }

  protected buildPrompt(task: Task): Message[] {
    const contextInfo = this.buildContextInfo(task);

    return [
      {
        role: 'user',
        content: `${contextInfo}

## Documentation Task
${task.description}

Generate documentation in the specified JSON format.`,
      },
    ];
  }

  getExpertOptions(): Readonly<DocumentationExpertOptions> {
    return { ...this.expertOptions };
  }

  private executeHeuristic(
    task: Task,
    docType: DocumentationResult['documentationType'],
    startTime: number
  ): Result<TaskResult, AgentError> {
    const sections = generateHeuristicSections(docType);
    const content = generateHeuristicContent(docType, sections, {
      includeBadges: this.expertOptions.includeBadges,
      generateTOC: this.expertOptions.generateTOC,
    });

    const result: DocumentationResult = {
      content,
      documentationType: docType,
      sections,
      recommendations: generateHeuristicRecommendations(docType),
      warnings: detectDocumentationWarnings(task.description),
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
    docType: DocumentationResult['documentationType'],
    startTime: number
  ): Promise<Result<TaskResult, AgentError>> {
    const messages = this.buildPrompt(task);

    const request: CompletionRequest = {
      messages,
      systemPrompt: this.systemPrompt ?? DOCUMENTATION_EXPERT_SYSTEM_PROMPT,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    };

    const completionResult = await this.complete(request);
    if (!completionResult.ok) {
      return err(completionResult.error);
    }

    const response = completionResult.value;
    const textContent = this.extractTextContent(response.content);
    const result = parseDocumentationResult(textContent, docType);

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

    if (task.context.workingDirectory !== undefined) {
      parts.push(`Project: ${task.context.workingDirectory}`);
    }

    if (task.context.files !== undefined && task.context.files.length > 0) {
      parts.push(`Files to Document:\n${task.context.files.map((f) => `- ${f}`).join('\n')}`);
    }

    if (this.expertOptions.format !== undefined) {
      parts.push(`Format: ${this.expertOptions.format}`);
    }

    if (this.expertOptions.audienceLevel !== undefined) {
      parts.push(`Target Audience: ${this.expertOptions.audienceLevel}`);
    }

    if (this.expertOptions.includeExamples === true) {
      parts.push('Note: Include code examples');
    }

    if (this.expertOptions.generateTOC === true) {
      parts.push('Note: Generate table of contents');
    }

    if (this.expertOptions.includeBadges === true) {
      parts.push('Note: Include badges for README');
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
  expertOpts: DocumentationExpertOptions
): BaseAgentOptions {
  const temperature = expertOpts.temperature ?? EXPERT_DEFAULT_TEMPERATURES.documentation;
  const baseCapabilities = EXPERT_DEFAULT_CAPABILITIES.documentation_expert;
  const additionalCaps = expertOpts.additionalCapabilities ?? [];

  const baseOptions: BaseAgentOptions = {
    id: options.id ?? 'documentation-expert',
    role: 'documentation_expert',
    capabilities: [...baseCapabilities, ...additionalCaps] as AgentCapability[],
    temperature,
    maxTokens: options.maxTokens ?? 8192,
    systemPrompt: expertOpts.systemPromptOverride ?? DOCUMENTATION_EXPERT_SYSTEM_PROMPT,
  };

  if (options.adapter !== undefined) baseOptions.adapter = options.adapter;
  if (options.logger !== undefined) baseOptions.logger = options.logger;

  return baseOptions;
}

function extractJsonFromText(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match?.[1] !== undefined) {
    return match[1].trim();
  }
  return text.trim();
}

const VALID_DOC_TYPES = new Set<DocumentationResult['documentationType']>([
  'api',
  'readme',
  'guide',
  'reference',
]);

function isValidDocType(v: unknown): v is DocumentationResult['documentationType'] {
  return typeof v === 'string' && VALID_DOC_TYPES.has(v as DocumentationResult['documentationType']);
}

function isDocUnitConfidence(v: unknown): v is number {
  return typeof v === 'number' && v >= 0 && v <= 1;
}

function isDocStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function applyDocOptionalFields(
  result: DocumentationResult,
  p: Record<string, unknown>
): void {
  if (Array.isArray(p['sections'])) result.sections = p['sections'] as DocumentationResult['sections'];
  // apiDocs is an object (ApiDocumentation), not a top-level array.
  if (isPlainObject(p['apiDocs'])) {
    result.apiDocs = p['apiDocs'] as unknown as NonNullable<DocumentationResult['apiDocs']>;
  }
  if (isDocStringArray(p['recommendations'])) result.recommendations = p['recommendations'];
  if (isDocStringArray(p['warnings'])) result.warnings = p['warnings'];
}

/**
 * Parse documentation result with runtime type guards (#1913 Class A).
 * Replaces `as Partial<DocumentationResult>` with validated field access.
 */
function parseDocumentationResult(
  text: string,
  defaultType: DocumentationResult['documentationType']
): DocumentationResult {
  try {
    const jsonText = extractJsonFromText(text);
    const rawParsed: unknown = JSON.parse(jsonText);
    if (!isPlainObject(rawParsed)) {
      throw new Error('Parsed value is not a plain object');
    }
    const result: DocumentationResult = {
      content: typeof rawParsed['content'] === 'string' ? rawParsed['content'] : 'Documentation generated',
      documentationType: isValidDocType(rawParsed['documentationType'])
        ? rawParsed['documentationType']
        : defaultType,
      confidence: isDocUnitConfidence(rawParsed['confidence']) ? rawParsed['confidence'] : 0.7,
    };
    applyDocOptionalFields(result, rawParsed);
    return result;
  } catch {
    return { content: text, documentationType: defaultType, confidence: 0.5 };
  }
}

export function createDocumentationExpert(
  options?: Partial<BaseAgentOptions> & { expertOptions?: DocumentationExpertOptions }
): DocumentationExpert {
  return new DocumentationExpert(options);
}
