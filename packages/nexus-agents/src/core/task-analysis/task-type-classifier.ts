/**
 * Task Type Classifier
 *
 * Classifies tasks as "reasoning" or "knowledge" type to enable
 * optimal protocol selection and routing decisions.
 *
 * Based on research from arXiv:2502.19130:
 * - Voting works better for reasoning tasks (+13.2%)
 * - Consensus works better for knowledge tasks (+2.8%)
 *
 * Moved to core/ to allow use by adapters layer without layer violation.
 *
 * @module core/task-analysis/task-type-classifier
 * (Source: Issue #125, arXiv:2502.19130)
 */

import type { Task } from '../types/agent.js';
import { createLogger } from '../logger.js';
import type { ILogger } from '../logger.js';

/**
 * Task type classification.
 */
export type TaskType = 'reasoning' | 'knowledge' | 'unknown';

/**
 * Classification result with confidence.
 */
export interface ClassificationResult {
  /** Classified task type */
  readonly type: TaskType;
  /** Confidence score (0-1) */
  readonly confidence: number;
  /** Signals that contributed to classification */
  readonly signals: readonly ClassificationSignal[];
}

/**
 * A signal that contributed to classification.
 */
export interface ClassificationSignal {
  /** Signal name */
  readonly name: string;
  /** Weight contribution to classification */
  readonly weight: number;
  /** Whether signal indicates reasoning or knowledge */
  readonly indicates: 'reasoning' | 'knowledge';
}

/**
 * Configuration for task type classifier.
 */
export interface TaskTypeClassifierConfig {
  /** Logger instance */
  readonly logger?: ILogger;
  /** Minimum confidence to return non-unknown type (default: 0.3) */
  readonly minConfidence?: number;
}

// Reasoning task indicators (logical inference, problem-solving)
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
  {
    pattern: /\b(trade-?off|pros? and cons?|advantages?|disadvantages?)\b/i,
    weight: 0.25,
    name: 'tradeoff-analysis',
  },
  { pattern: /\b(debug|fix|troubleshoot|diagnose)\b/i, weight: 0.3, name: 'debugging' },
  { pattern: /\b(design|architect|plan|strategy)\b/i, weight: 0.25, name: 'design-task' },
  { pattern: /\b(optimize|improve|enhance|refactor)\b/i, weight: 0.2, name: 'optimization' },
  { pattern: /\b(should|would|could|best approach)\b/i, weight: 0.15, name: 'advisory-question' },
];

// Knowledge task indicators (factual retrieval, lookup)
const KNOWLEDGE_PATTERNS: ReadonlyArray<{ pattern: RegExp; weight: number; name: string }> = [
  { pattern: /\b(what is|what are|who is|who are)\b/i, weight: 0.3, name: 'factual-question' },
  { pattern: /\b(define|definition of|meaning of)\b/i, weight: 0.35, name: 'definition-request' },
  { pattern: /\b(list|enumerate|name|identify)\b/i, weight: 0.25, name: 'enumeration' },
  { pattern: /\b(when|where|which)\b/i, weight: 0.2, name: 'specific-query' },
  { pattern: /\b(version|release|date|year|number)\b/i, weight: 0.25, name: 'factual-detail' },
  { pattern: /\b(syntax|format|structure|schema)\b/i, weight: 0.2, name: 'format-query' },
  { pattern: /\b(documentation|docs|reference|api)\b/i, weight: 0.25, name: 'doc-lookup' },
  { pattern: /\b(example|sample|template|boilerplate)\b/i, weight: 0.2, name: 'example-request' },
  { pattern: /\b(tell me|show me|give me)\b/i, weight: 0.15, name: 'information-request' },
];

const logger = createLogger({ component: 'task-type-classifier' });

/**
 * Classifies tasks as reasoning or knowledge type.
 */
export class TaskTypeClassifier {
  private readonly config: Required<Omit<TaskTypeClassifierConfig, 'logger'>>;
  private readonly log: ILogger;

  constructor(config?: TaskTypeClassifierConfig) {
    this.config = {
      minConfidence: config?.minConfidence ?? 0.3,
    };
    this.log = config?.logger ?? logger;
  }

  /**
   * Classify a task based on its content.
   */
  classify(task: Task): ClassificationResult {
    const content = this.extractContent(task);
    const signals: ClassificationSignal[] = [];

    const reasoningScore = this.matchPatterns(content, REASONING_PATTERNS, 'reasoning', signals);
    const knowledgeScore = this.matchPatterns(content, KNOWLEDGE_PATTERNS, 'knowledge', signals);

    return this.computeResult(reasoningScore, knowledgeScore, signals);
  }

  private matchPatterns(
    content: string,
    patterns: ReadonlyArray<{ pattern: RegExp; weight: number; name: string }>,
    indicates: 'reasoning' | 'knowledge',
    signals: ClassificationSignal[]
  ): number {
    let score = 0;
    for (const { pattern, weight, name } of patterns) {
      if (pattern.test(content)) {
        score += weight;
        signals.push({ name, weight, indicates });
      }
    }
    return score;
  }

  private computeResult(
    reasoningScore: number,
    knowledgeScore: number,
    signals: readonly ClassificationSignal[]
  ): ClassificationResult {
    const totalScore = reasoningScore + knowledgeScore;
    if (totalScore === 0) {
      return { type: 'unknown', confidence: 0, signals };
    }

    const reasoningRatio = reasoningScore / totalScore;
    const knowledgeRatio = knowledgeScore / totalScore;
    const confidence = Math.abs(reasoningRatio - knowledgeRatio);

    if (confidence < this.config.minConfidence) {
      this.log.debug('Classification confidence below threshold', {
        reasoningScore,
        knowledgeScore,
        confidence,
        threshold: this.config.minConfidence,
      });
      return { type: 'unknown', confidence, signals };
    }

    const type: TaskType = reasoningRatio > knowledgeRatio ? 'reasoning' : 'knowledge';
    this.log.debug('Task classified', {
      type,
      confidence,
      reasoningScore,
      knowledgeScore,
      signalCount: signals.length,
    });

    return { type, confidence, signals };
  }

  private extractContent(task: Task): string {
    const parts: string[] = [];

    if (task.description) {
      parts.push(task.description);
    }

    if (task.context.history !== undefined) {
      for (const item of task.context.history) {
        if (item.content) {
          parts.push(item.content);
        }
      }
    }

    if (task.context.metadata !== undefined) {
      const metadata = task.context.metadata;
      if (typeof metadata['instructions'] === 'string') {
        parts.push(metadata['instructions']);
      }
    }

    return parts.join(' ');
  }
}

/**
 * Creates a task type classifier.
 */
export function createTaskTypeClassifier(config?: TaskTypeClassifierConfig): TaskTypeClassifier {
  return new TaskTypeClassifier(config);
}
