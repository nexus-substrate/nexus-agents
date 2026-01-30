/**
 * nexus-agents/agents - TestingExpert
 *
 * Expert agent specialized in test generation, coverage analysis,
 * and quality assurance. Uses temperature 0.3 for precise test output.
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
  type TestingAnalysisResult,
  type GeneratedTest,
  type CoverageMetrics,
  GeneratedTestSchema,
  CoverageMetricsSchema,
  EXPERT_DEFAULT_TEMPERATURES,
  EXPERT_DEFAULT_CAPABILITIES,
} from './expert-types.js';
import { TESTING_EXPERT_SYSTEM_PROMPT } from './expert-prompts.js';
import {
  createUnitTestTemplate,
  createIntegrationTestTemplate,
  createComponentTestTemplate,
  createGenericTestTemplate,
  createHeuristicCoverage,
  assessHeuristicQuality,
  generateHeuristicRecommendations,
  detectTestingWarnings,
  inferOperationType,
} from './testing-expert-helpers.js';

/**
 * Configuration options for TestingExpert.
 */
export interface TestingExpertOptions extends ExpertOptions {
  /** Preferred testing framework */
  framework?: 'vitest' | 'jest' | 'mocha' | 'playwright' | 'cypress';
  /** Target coverage percentage */
  targetCoverage?: number;
  /** Include mocking strategies */
  includeMocking?: boolean;
  /** Test style preference */
  testStyle?: 'bdd' | 'tdd' | 'behavioral';
  /** Generate test data factories */
  generateFactories?: boolean;
}

/**
 * TestingExpert - Expert agent for testing-related tasks.
 */
export class TestingExpert extends BaseAgent {
  private readonly expertOptions: TestingExpertOptions;

  constructor(options: Partial<BaseAgentOptions> & { expertOptions?: TestingExpertOptions } = {}) {
    const expertOpts = options.expertOptions ?? {};
    const baseOptions = buildBaseOptions(options, expertOpts);

    super(baseOptions);
    this.expertOptions = expertOpts;
  }

  protected async executeTask(task: Task): Promise<Result<TaskResult, AgentError>> {
    const startTime = getTimeProvider().now();
    const operationType = inferOperationType(task.description);

    this.logger.info('Executing testing task', {
      taskId: task.id,
      operationType,
      framework: this.expertOptions.framework,
      hasAdapter: this.adapter !== undefined,
    });

    if (this.adapter === undefined) {
      return this.executeHeuristic(task, operationType, startTime);
    }

    return this.executeWithModel(task, operationType, startTime);
  }

  protected buildPrompt(task: Task): Message[] {
    const contextInfo = this.buildContextInfo(task);

    return [
      {
        role: 'user',
        content: `${contextInfo}

## Testing Task
${task.description}

Analyze and provide testing recommendations in the specified JSON format.`,
      },
    ];
  }

  getExpertOptions(): Readonly<TestingExpertOptions> {
    return { ...this.expertOptions };
  }

  private executeHeuristic(
    task: Task,
    operationType: TestingAnalysisResult['operationType'],
    startTime: number
  ): Result<TaskResult, AgentError> {
    const tests = operationType === 'generation' ? this.generateHeuristicTests(task) : undefined;

    const coverage = operationType === 'coverage_analysis' ? createHeuristicCoverage() : undefined;

    const quality =
      operationType === 'quality_assessment' ? assessHeuristicQuality(task.description) : undefined;

    const result: TestingAnalysisResult = {
      content: `Heuristic testing analysis for ${operationType}. Model adapter recommended.`,
      operationType,
      tests,
      coverage,
      quality,
      recommendations: generateHeuristicRecommendations(operationType),
      warnings: detectTestingWarnings(task.description),
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
    operationType: TestingAnalysisResult['operationType'],
    startTime: number
  ): Promise<Result<TaskResult, AgentError>> {
    const messages = this.buildPrompt(task);

    const request: CompletionRequest = {
      messages,
      systemPrompt: this.systemPrompt ?? TESTING_EXPERT_SYSTEM_PROMPT,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    };

    const completionResult = await this.complete(request);
    if (!completionResult.ok) {
      return err(completionResult.error);
    }

    const response = completionResult.value;
    const textContent = this.extractTextContent(response.content);
    const result = parseTestingResult(textContent, operationType);

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
      parts.push(`Files to Test:\n${task.context.files.map((f) => `- ${f}`).join('\n')}`);
    }

    if (this.expertOptions.framework !== undefined) {
      parts.push(`Testing Framework: ${this.expertOptions.framework}`);
    }

    if (this.expertOptions.targetCoverage !== undefined) {
      parts.push(`Target Coverage: ${String(this.expertOptions.targetCoverage)}%`);
    }

    if (this.expertOptions.testStyle !== undefined) {
      parts.push(`Test Style: ${this.expertOptions.testStyle}`);
    }

    if (this.expertOptions.includeMocking === true) {
      parts.push('Note: Include mocking strategies');
    }

    if (this.expertOptions.generateFactories === true) {
      parts.push('Note: Generate test data factories');
    }

    return parts.length > 0 ? `## Context\n${parts.join('\n')}\n` : '';
  }

  private generateHeuristicTests(task: Task): GeneratedTest[] {
    const tests: GeneratedTest[] = [];
    const desc = task.description.toLowerCase();
    const framework = this.expertOptions.framework ?? 'vitest';

    if (desc.includes('function') || desc.includes('util')) {
      tests.push(createUnitTestTemplate(framework));
    }

    if (desc.includes('api') || desc.includes('endpoint')) {
      tests.push(createIntegrationTestTemplate(framework));
    }

    if (desc.includes('component') || desc.includes('ui')) {
      tests.push(createComponentTestTemplate(framework));
    }

    if (tests.length === 0) {
      tests.push(createGenericTestTemplate(framework));
    }

    return tests;
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
  expertOpts: TestingExpertOptions
): BaseAgentOptions {
  const temperature = expertOpts.temperature ?? EXPERT_DEFAULT_TEMPERATURES.testing;
  const baseCapabilities = EXPERT_DEFAULT_CAPABILITIES.testing_expert;
  const additionalCaps = expertOpts.additionalCapabilities ?? [];

  const baseOptions: BaseAgentOptions = {
    id: options.id ?? 'testing-expert',
    role: 'testing_expert',
    capabilities: [...baseCapabilities, ...additionalCaps] as AgentCapability[],
    temperature,
    maxTokens: options.maxTokens ?? 8192,
    systemPrompt: expertOpts.systemPromptOverride ?? TESTING_EXPERT_SYSTEM_PROMPT,
  };

  if (options.adapter !== undefined) baseOptions.adapter = options.adapter;
  if (options.logger !== undefined) baseOptions.logger = options.logger;

  return baseOptions;
}

function extractJsonFromText(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match?.[1]?.trim() ?? text.trim();
}

function validateTests(tests: unknown[] | undefined): GeneratedTest[] {
  return (tests ?? [])
    .map((t) => GeneratedTestSchema.safeParse(t))
    .filter((r) => r.success)
    .map((r) => r.data as GeneratedTest);
}

function buildTestingResult(
  parsed: Partial<TestingAnalysisResult>,
  defaultType: TestingAnalysisResult['operationType']
): TestingAnalysisResult {
  const validTests = validateTests(parsed.tests);
  const coverageResult = CoverageMetricsSchema.safeParse(parsed.coverage);

  const result: TestingAnalysisResult = {
    content: parsed.content ?? 'Testing analysis completed',
    operationType: parsed.operationType ?? defaultType,
    confidence: parsed.confidence ?? 0.7,
  };
  if (validTests.length > 0) result.tests = validTests;
  if (coverageResult.success) result.coverage = coverageResult.data as CoverageMetrics;
  if (parsed.quality !== undefined) result.quality = parsed.quality;
  if (parsed.recommendations !== undefined) result.recommendations = parsed.recommendations;
  if (parsed.warnings !== undefined) result.warnings = parsed.warnings;
  return result;
}

function parseTestingResult(
  text: string,
  defaultType: TestingAnalysisResult['operationType']
): TestingAnalysisResult {
  try {
    const jsonText = extractJsonFromText(text);
    const parsed = JSON.parse(jsonText) as Partial<TestingAnalysisResult>;
    return buildTestingResult(parsed, defaultType);
  } catch {
    return { content: text, operationType: defaultType, confidence: 0.5 };
  }
}

export function createTestingExpert(
  options?: Partial<BaseAgentOptions> & { expertOptions?: TestingExpertOptions }
): TestingExpert {
  return new TestingExpert(options);
}
