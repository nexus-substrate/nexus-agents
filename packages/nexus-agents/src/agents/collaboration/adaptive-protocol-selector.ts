/**
 * Adaptive Protocol Selector
 *
 * Automatically selects the optimal collaboration protocol based on task type.
 *
 * Based on research from arXiv:2502.19130:
 * - Voting (parallel) works better for reasoning tasks (+13.2%)
 * - Consensus works better for knowledge tasks (+2.8%)
 *
 * @module agents/collaboration/adaptive-protocol-selector
 * (Source: Issue #125, arXiv:2502.19130)
 */

import type { Result, IAgent, ILogger } from '../../core/index.js';
import { AgentError, createLogger } from '../../core/index.js';
import type {
  CollaborationConfig,
  CollaborationResult,
  CollaborationPattern,
} from './collaboration-types.js';
import { ProtocolFactory, type ProtocolOptions } from './collaboration-protocol.js';
import {
  TaskTypeClassifier,
  createTaskTypeClassifier,
  type TaskType,
  type ClassificationResult,
} from '../../core/task-analysis/index.js';

/**
 * Configuration for adaptive protocol selection.
 */
export interface AdaptiveProtocolConfig {
  /** Logger instance */
  readonly logger?: ILogger;
  /** Protocol options to pass to factory */
  readonly protocolOptions?: ProtocolOptions;
  /** Classifier configuration */
  readonly classifierConfig?: {
    readonly minConfidence?: number;
  };
  /** Protocol mapping for task types */
  readonly protocolMapping?: {
    readonly reasoning?: CollaborationPattern;
    readonly knowledge?: CollaborationPattern;
    readonly unknown?: CollaborationPattern;
  };
  /** Whether to log classification decisions */
  readonly logDecisions?: boolean;
}

/**
 * Default protocol mapping based on research findings.
 */
const DEFAULT_PROTOCOL_MAPPING: Record<TaskType, CollaborationPattern> = {
  // Voting (parallel execution + majority selection) for reasoning
  reasoning: 'parallel',
  // Consensus (structured voting) for knowledge/factual tasks
  knowledge: 'consensus',
  // Default to parallel when unknown
  unknown: 'parallel',
};

const logger = createLogger({ component: 'adaptive-protocol-selector' });

/**
 * Selection result with metadata.
 */
export interface SelectionResult {
  /** Selected protocol pattern */
  readonly pattern: CollaborationPattern;
  /** Classification that led to selection */
  readonly classification: ClassificationResult;
  /** Whether an explicit override was applied */
  readonly wasOverridden: boolean;
}

/**
 * Adaptive protocol selector that chooses protocols based on task type.
 */
export class AdaptiveProtocolSelector {
  private readonly factory: ProtocolFactory;
  private readonly classifier: TaskTypeClassifier;
  private readonly config: Required<
    Omit<AdaptiveProtocolConfig, 'logger' | 'protocolOptions' | 'classifierConfig'>
  >;
  private readonly log: ILogger;

  constructor(config?: AdaptiveProtocolConfig) {
    this.factory = new ProtocolFactory(config?.protocolOptions);
    this.classifier = createTaskTypeClassifier(config?.classifierConfig);
    this.config = {
      protocolMapping: config?.protocolMapping ?? DEFAULT_PROTOCOL_MAPPING,
      logDecisions: config?.logDecisions ?? true,
    };
    this.log = config?.logger ?? logger;
  }

  /**
   * Select the optimal protocol for a task.
   *
   * @param config - Collaboration config (pattern may be overridden)
   * @returns Selection result with chosen pattern and reasoning
   */
  selectProtocol(config: CollaborationConfig): SelectionResult {
    // If pattern is explicitly set to something other than 'auto', respect it
    // Note: 'auto' is not currently in CollaborationPattern, so this is for future extension
    const explicitPattern = config.pattern;

    // Classify the task
    const classification = this.classifier.classify(config.task);

    // Look up the protocol for this task type
    const mapping = this.config.protocolMapping;
    const selectedPattern =
      mapping[classification.type] ?? DEFAULT_PROTOCOL_MAPPING[classification.type];

    // If explicit pattern matches what we'd select, it's not really an override
    const wasOverridden = explicitPattern !== selectedPattern;

    if (this.config.logDecisions) {
      this.log.info('Protocol selection', {
        taskType: classification.type,
        confidence: classification.confidence,
        selectedPattern,
        explicitPattern,
        wasOverridden,
        topSignals: classification.signals.slice(0, 3).map((s) => s.name),
      });
    }

    // Use explicit pattern if provided, otherwise use adaptive selection
    return {
      pattern: wasOverridden ? explicitPattern : selectedPattern,
      classification,
      wasOverridden,
    };
  }

  /**
   * Execute collaboration with adaptive protocol selection.
   *
   * If config.pattern is provided, it will be used as an override.
   * Otherwise, the optimal protocol is selected based on task type.
   *
   * @param config - Collaboration configuration
   * @param agents - Available agents
   * @returns Collaboration result
   */
  async execute(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Promise<Result<CollaborationResult, AgentError>> {
    const selection = this.selectProtocol(config);

    // Create new config with selected pattern
    const adaptedConfig: CollaborationConfig = {
      ...config,
      pattern: selection.pattern,
    };

    this.log.info('Executing with adaptive protocol', {
      sessionId: config.sessionId,
      originalPattern: config.pattern,
      selectedPattern: selection.pattern,
      taskType: selection.classification.type,
    });

    return this.factory.execute(adaptedConfig, agents);
  }

  /**
   * Get recommended protocol for a task without executing.
   *
   * Useful for preview/explanation of what protocol would be selected.
   */
  getRecommendation(config: CollaborationConfig): {
    recommendedPattern: CollaborationPattern;
    taskType: TaskType;
    confidence: number;
    reasoning: string;
  } {
    const selection = this.selectProtocol(config);
    const { type, confidence, signals } = selection.classification;

    const topSignals = signals
      .slice(0, 3)
      .map((s) => s.name)
      .join(', ');
    const reasoning =
      type === 'unknown'
        ? 'Task type could not be determined with sufficient confidence. Using default protocol.'
        : `Task classified as "${type}" type (confidence: ${(confidence * 100).toFixed(0)}%) based on signals: ${topSignals}. ${
            type === 'reasoning'
              ? 'Voting/parallel protocols work better for reasoning tasks (+13.2%).'
              : 'Consensus protocols work better for knowledge tasks (+2.8%).'
          }`;

    return {
      recommendedPattern: selection.pattern,
      taskType: type,
      confidence,
      reasoning,
    };
  }
}

/**
 * Creates an adaptive protocol selector.
 */
export function createAdaptiveProtocolSelector(
  config?: AdaptiveProtocolConfig
): AdaptiveProtocolSelector {
  return new AdaptiveProtocolSelector(config);
}
