/**
 * Shared Task Analyzer
 *
 * Unified task analysis providing multiple classification views:
 * - ReasoningKnowledge: reasoning vs knowledge tasks (arXiv:2502.19130)
 * - Complexity: simple/moderate/complex/expert (RouteLLM)
 * - TaskType: 8-type taxonomy for capability routing
 * - Capabilities: parallelizable, multimodal, code generation flags
 *
 * Consolidates 5 independent task analyzers per ADR-0004.
 *
 * @module core/task-analysis/shared-task-analyzer
 * (Source: Issue #574, ADR-0004)
 */

import { createLogger, type ILogger } from '../logger.js';
import type { Task } from '../types/agent.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Reasoning vs Knowledge classification (arXiv:2502.19130).
 */
export type ReasoningKnowledgeType = 'reasoning' | 'knowledge' | 'unknown';

/**
 * Complexity levels for routing (RouteLLM).
 */
export type ComplexityLevel = 'simple' | 'moderate' | 'complex' | 'expert';

/**
 * 8-type task taxonomy for capability-based routing.
 */
export type TaskTypeCategory =
  | 'architecture'
  | 'code_implementation'
  | 'code_review'
  | 'test_generation'
  | 'documentation'
  | 'large_codebase'
  | 'bulk_operations'
  | 'general';

/**
 * Task capability flags.
 */
export interface TaskCapabilities {
  readonly parallelizable: boolean;
  readonly multimodal: boolean;
  readonly codeGeneration: boolean;
  readonly budgetSensitive: boolean;
  readonly highContext: boolean;
}

/**
 * Unified analysis result combining all views.
 */
export interface TaskAnalysisResult {
  /** Reasoning vs knowledge classification */
  readonly reasoningType: ReasoningKnowledgeType;
  readonly reasoningConfidence: number;
  /** Complexity level */
  readonly complexity: ComplexityLevel;
  readonly complexityScore: number;
  /** Task type category */
  readonly taskType: TaskTypeCategory;
  readonly taskTypeConfidence: number;
  /** Capability flags */
  readonly capabilities: TaskCapabilities;
  /** Estimated token count */
  readonly estimatedTokens: number;
  /** Matched signals for observability */
  readonly matchedSignals: readonly string[];
}

/**
 * Configuration for SharedTaskAnalyzer.
 */
export interface SharedTaskAnalyzerConfig {
  readonly logger?: ILogger;
  /** Minimum confidence for non-unknown reasoning type (default: 0.3) */
  readonly minReasoningConfidence?: number;
  /** Minimum confidence for task type (default: 0.2) */
  readonly minTaskTypeConfidence?: number;
}

/**
 * Shared task analyzer interface.
 */
export interface ISharedTaskAnalyzer {
  analyze(task: Task | string): TaskAnalysisResult;
  getReasoningType(task: Task | string): { type: ReasoningKnowledgeType; confidence: number };
  getComplexity(task: Task | string): { level: ComplexityLevel; score: number };
  getTaskType(task: Task | string): { type: TaskTypeCategory; confidence: number };
  getCapabilities(task: Task | string): TaskCapabilities;
  estimateTokens(task: Task | string): number;
}

// ============================================================================
// Unified Keyword Registry
// ============================================================================

/** Reasoning task patterns (arXiv:2502.19130) */
const REASONING_PATTERNS: ReadonlyArray<{ pattern: RegExp; weight: number; name: string }> = [
  { pattern: /\b(why|how come|explain why)\b/i, weight: 0.3, name: 'causal-question' },
  { pattern: /\b(analyze|evaluate|assess|compare)\b/i, weight: 0.25, name: 'analysis-verb' },
  { pattern: /\b(solve|calculate|compute|derive)\b/i, weight: 0.35, name: 'problem-solving' },
  {
    pattern: /\b(if|then|therefore|because|since|assuming)\b/i,
    weight: 0.2,
    name: 'logical-connector',
  },
  { pattern: /\b(prove|deduce|infer|conclude)\b/i, weight: 0.35, name: 'deductive-verb' },
  { pattern: /\b(trade-?off|pros? and cons?)\b/i, weight: 0.25, name: 'tradeoff-analysis' },
  { pattern: /\b(debug|fix|troubleshoot|diagnose)\b/i, weight: 0.3, name: 'debugging' },
  { pattern: /\b(design|architect|plan|strategy)\b/i, weight: 0.25, name: 'design-task' },
  { pattern: /\b(optimize|improve|enhance|refactor)\b/i, weight: 0.2, name: 'optimization' },
];

/** Knowledge task patterns (arXiv:2502.19130) */
const KNOWLEDGE_PATTERNS: ReadonlyArray<{ pattern: RegExp; weight: number; name: string }> = [
  { pattern: /\b(what is|what are|who is|who are)\b/i, weight: 0.3, name: 'factual-question' },
  { pattern: /\b(define|definition of|meaning of)\b/i, weight: 0.35, name: 'definition-request' },
  { pattern: /\b(list|enumerate|name|identify)\b/i, weight: 0.25, name: 'enumeration' },
  { pattern: /\b(when|where|which)\b/i, weight: 0.2, name: 'specific-query' },
  { pattern: /\b(documentation|docs|reference|api)\b/i, weight: 0.25, name: 'doc-lookup' },
  { pattern: /\b(example|sample|template|boilerplate)\b/i, weight: 0.2, name: 'example-request' },
  { pattern: /\b(tell me|show me|give me)\b/i, weight: 0.15, name: 'information-request' },
];

/** Task type keywords for 8-type taxonomy */
const TASK_TYPE_KEYWORDS: Record<TaskTypeCategory, readonly string[]> = {
  architecture: [
    'architecture',
    'design',
    'system',
    'pattern',
    'scalability',
    'microservice',
    'distributed',
    'api design',
  ],
  code_implementation: [
    'implement',
    'create',
    'build',
    'write code',
    'add feature',
    'function',
    'class',
    'module',
    'component',
  ],
  code_review: [
    'review',
    'audit',
    'check',
    'analyze code',
    'evaluate',
    'inspect',
    'security review',
    'bugs',
    'vulnerabilities',
  ],
  test_generation: [
    'test',
    'unit test',
    'integration test',
    'e2e',
    'coverage',
    'spec',
    'mock',
    'vitest',
    'jest',
  ],
  documentation: [
    'document',
    'readme',
    'jsdoc',
    'comment',
    'explain',
    'tutorial',
    'guide',
    'api doc',
    'changelog',
  ],
  large_codebase: [
    'entire codebase',
    'all files',
    'whole project',
    'repository',
    'monorepo',
    'workspace',
    'many files',
  ],
  bulk_operations: [
    'bulk',
    'batch',
    'mass',
    'multiple files',
    'refactor all',
    'update all',
    'rename all',
    'migrate',
  ],
  general: [],
};

/** High complexity indicators */
const HIGH_COMPLEXITY_KEYWORDS: readonly string[] = [
  'complex',
  'optimize',
  'architecture',
  'security',
  'performance',
  'distributed',
  'concurrent',
  'async',
  'race condition',
  'deadlock',
  'memory leak',
  'algorithm',
  'trade-off',
  'decision',
  'design pattern',
  'refactor',
  'legacy',
];

/** Code generation indicators */
const CODE_GEN_KEYWORDS: readonly string[] = [
  'implement',
  'create',
  'write',
  'generate',
  'build',
  'add',
  'new',
  'function',
  'class',
  'component',
  'test',
];

/** Multimodal indicators */
const MULTIMODAL_KEYWORDS: readonly string[] = [
  'image',
  'screenshot',
  'diagram',
  'photo',
  'picture',
  'audio',
  'video',
  'ui',
  'visual',
  'mockup',
];

/** Parallelizable indicators */
const PARALLEL_KEYWORDS: readonly string[] = [
  'multiple',
  'batch',
  'bulk',
  'all files',
  'each',
  'every',
  'parallel',
  'concurrent',
  'independent',
];

// ============================================================================
// Implementation
// ============================================================================

/** Token estimation constants */
const TOKENS_PER_CHAR = 0.25;
const BASE_TOKEN_OVERHEAD = 500;

/**
 * Unified task analyzer implementation.
 */
export class SharedTaskAnalyzer implements ISharedTaskAnalyzer {
  private readonly logger: ILogger;
  private readonly minReasoningConfidence: number;
  private readonly minTaskTypeConfidence: number;

  constructor(config?: SharedTaskAnalyzerConfig) {
    this.logger = config?.logger ?? createLogger({ component: 'SharedTaskAnalyzer' });
    this.minReasoningConfidence = config?.minReasoningConfidence ?? 0.3;
    this.minTaskTypeConfidence = config?.minTaskTypeConfidence ?? 0.2;
  }

  analyze(task: Task | string): TaskAnalysisResult {
    const content = this.extractContent(task);
    const matchedSignals: string[] = [];

    const reasoning = this.computeReasoningType(content, matchedSignals);
    const complexity = this.computeComplexity(content, matchedSignals);
    const taskType = this.computeTaskType(content, matchedSignals);
    const capabilities = this.computeCapabilities(content, matchedSignals);
    const estimatedTokens = this.computeTokens(content);

    this.logger.debug('Task analyzed', {
      reasoningType: reasoning.type,
      complexity: complexity.level,
      taskType: taskType.type,
      signals: matchedSignals.length,
    });

    return {
      reasoningType: reasoning.type,
      reasoningConfidence: reasoning.confidence,
      complexity: complexity.level,
      complexityScore: complexity.score,
      taskType: taskType.type,
      taskTypeConfidence: taskType.confidence,
      capabilities,
      estimatedTokens,
      matchedSignals,
    };
  }

  getReasoningType(task: Task | string): { type: ReasoningKnowledgeType; confidence: number } {
    const content = this.extractContent(task);
    return this.computeReasoningType(content, []);
  }

  getComplexity(task: Task | string): { level: ComplexityLevel; score: number } {
    const content = this.extractContent(task);
    return this.computeComplexity(content, []);
  }

  getTaskType(task: Task | string): { type: TaskTypeCategory; confidence: number } {
    const content = this.extractContent(task);
    return this.computeTaskType(content, []);
  }

  getCapabilities(task: Task | string): TaskCapabilities {
    const content = this.extractContent(task);
    return this.computeCapabilities(content, []);
  }

  estimateTokens(task: Task | string): number {
    const content = this.extractContent(task);
    return this.computeTokens(content);
  }

  private extractContent(task: Task | string): string {
    if (typeof task === 'string') return task;
    // Extract text from task description and relevant context
    const parts = [task.description];
    const ctx = task.context;
    if (ctx.workingDirectory !== undefined && ctx.workingDirectory !== '') {
      parts.push(ctx.workingDirectory);
    }
    if (ctx.files !== undefined && ctx.files.length > 0) {
      parts.push(ctx.files.join(' '));
    }
    return parts.join(' ').trim();
  }

  private computeReasoningType(
    content: string,
    signals: string[]
  ): { type: ReasoningKnowledgeType; confidence: number } {
    const lower = content.toLowerCase();
    let reasoningScore = 0;
    let knowledgeScore = 0;

    for (const p of REASONING_PATTERNS) {
      if (p.pattern.test(lower)) {
        reasoningScore += p.weight;
        signals.push(`reasoning:${p.name}`);
      }
    }

    for (const p of KNOWLEDGE_PATTERNS) {
      if (p.pattern.test(lower)) {
        knowledgeScore += p.weight;
        signals.push(`knowledge:${p.name}`);
      }
    }

    const total = reasoningScore + knowledgeScore;
    if (total === 0) return { type: 'unknown', confidence: 0 };

    const reasoningRatio = reasoningScore / total;
    const confidence = Math.abs(reasoningScore - knowledgeScore) / total;

    if (confidence < this.minReasoningConfidence) {
      return { type: 'unknown', confidence };
    }

    return {
      type: reasoningRatio > 0.5 ? 'reasoning' : 'knowledge',
      confidence,
    };
  }

  private computeComplexity(
    content: string,
    signals: string[]
  ): { level: ComplexityLevel; score: number } {
    const lower = content.toLowerCase();
    let score = 0;

    // Length factor (0-0.25)
    const lengthScore = Math.min(content.length / 2000, 1) * 0.25;
    score += lengthScore;

    // Complexity keywords (0-0.4)
    const complexityMatches = HIGH_COMPLEXITY_KEYWORDS.filter((k) => lower.includes(k));
    const keywordScore = Math.min(complexityMatches.length / 5, 1) * 0.4;
    score += keywordScore;
    complexityMatches.forEach((k) => signals.push(`complexity:${k}`));

    // Multi-step indicators (0-0.2)
    const multiStepPatterns = [/first.*then/i, /step \d/i, /after that/i, /finally/i];
    const multiStepMatches = multiStepPatterns.filter((p) => p.test(lower)).length;
    score += Math.min(multiStepMatches / 3, 1) * 0.2;
    if (multiStepMatches > 0) signals.push('complexity:multi-step');

    // Question depth (0-0.15)
    const questionCount = (content.match(/\?/g) ?? []).length;
    score += Math.min(questionCount / 4, 1) * 0.15;

    // Normalize to 0-1
    const normalizedScore = Math.min(score, 1);

    const level: ComplexityLevel =
      normalizedScore < 0.25
        ? 'simple'
        : normalizedScore < 0.5
          ? 'moderate'
          : normalizedScore < 0.75
            ? 'complex'
            : 'expert';

    return { level, score: normalizedScore };
  }

  private computeTaskType(
    content: string,
    signals: string[]
  ): { type: TaskTypeCategory; confidence: number } {
    const lower = content.toLowerCase();
    const scores: Record<TaskTypeCategory, number> = {
      architecture: 0,
      code_implementation: 0,
      code_review: 0,
      test_generation: 0,
      documentation: 0,
      large_codebase: 0,
      bulk_operations: 0,
      general: 0.1, // Base score for general
    };

    for (const [type, keywords] of Object.entries(TASK_TYPE_KEYWORDS) as Array<
      [TaskTypeCategory, readonly string[]]
    >) {
      for (const keyword of keywords) {
        if (lower.includes(keyword)) {
          scores[type] += 1;
          signals.push(`taskType:${type}:${keyword}`);
        }
      }
    }

    let maxType: TaskTypeCategory = 'general';
    let maxScore = scores.general;
    for (const [type, score] of Object.entries(scores) as Array<[TaskTypeCategory, number]>) {
      if (score > maxScore) {
        maxType = type;
        maxScore = score;
      }
    }

    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? maxScore / totalScore : 0;

    if (confidence < this.minTaskTypeConfidence) {
      return { type: 'general', confidence };
    }

    return { type: maxType, confidence };
  }

  private computeCapabilities(content: string, signals: string[]): TaskCapabilities {
    const lower = content.toLowerCase();
    const budgetKeywords = ['cost', 'budget', 'cheap'];
    const highContextKeywords = ['entire', 'whole', 'all files'];

    const capabilities: TaskCapabilities = {
      parallelizable: PARALLEL_KEYWORDS.some((k) => lower.includes(k)),
      multimodal: MULTIMODAL_KEYWORDS.some((k) => lower.includes(k)),
      codeGeneration: CODE_GEN_KEYWORDS.some((k) => lower.includes(k)),
      budgetSensitive: budgetKeywords.some((k) => lower.includes(k)),
      highContext: highContextKeywords.some((k) => lower.includes(k)) || content.length > 1000,
    };

    // Add matched capability signals
    const capabilityNames: Array<keyof TaskCapabilities> = [
      'parallelizable',
      'multimodal',
      'codeGeneration',
      'budgetSensitive',
      'highContext',
    ];
    for (const cap of capabilityNames) {
      if (capabilities[cap]) signals.push(`capability:${cap}`);
    }

    return capabilities;
  }

  private computeTokens(content: string): number {
    return Math.ceil(content.length * TOKENS_PER_CHAR + BASE_TOKEN_OVERHEAD);
  }
}

/**
 * Creates a shared task analyzer instance.
 */
export function createSharedTaskAnalyzer(config?: SharedTaskAnalyzerConfig): ISharedTaskAnalyzer {
  return new SharedTaskAnalyzer(config);
}
