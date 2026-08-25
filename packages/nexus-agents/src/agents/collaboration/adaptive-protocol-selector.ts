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
import { AgentError, createLogger, createSharedTaskAnalyzer } from '../../core/index.js';
import type { ISharedTaskAnalyzer, ReasoningKnowledgeType } from '../../core/index.js';
import type {
  CollaborationConfig,
  CollaborationResult,
  CollaborationPattern,
} from './collaboration-types.js';
import { ProtocolFactory, type ProtocolOptions } from './collaboration-protocol.js';

/** Task type alias for protocol mapping keys. */
type TaskType = ReasoningKnowledgeType;

/** Classification result from SharedTaskAnalyzer. */
interface ClassificationResult {
  readonly type: TaskType;
  readonly confidence: number;
}

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
  /**
   * The pattern that will be used.
   *
   * This is always `config.pattern`. `CollaborationPattern` has no `auto`
   * member, so a caller cannot ask for adaptive selection and adaptation can
   * never win — see {@link adaptivePattern} for what it would have chosen
   * (#4833).
   */
  readonly pattern: CollaborationPattern;
  /**
   * The pattern adaptation would choose from the task classification (#4833).
   *
   * Advisory. Previously computed and discarded, which left the caller unable
   * to see the one thing this class exists to produce.
   */
  readonly adaptivePattern: CollaborationPattern;
  /** Classification that led to {@link adaptivePattern}. */
  readonly classification: ClassificationResult;
  /**
   * Whether the caller's pattern differs from {@link adaptivePattern}.
   *
   * A comparison, NOT evidence that a selection was applied and then
   * overridden — nothing is applied. It was logged as though a live decision
   * had been made and reversed (#4833).
   */
  readonly wasOverridden: boolean;
}

/**
 * Adaptive protocol selector that classifies tasks and recommends protocols.
 *
 * Advisory: `selectProtocol` cannot change the protocol in use, because
 * `CollaborationPattern` has no `auto` member and so a caller has no way to
 * defer to adaptation. `getRecommendation` reports what adaptation would
 * choose; acting on it is the caller's decision.
 *
 * Whether to add that sentinel so adaptation can win is #4833. Its named
 * consumer is `TechLeadCollaboration.executeCollaboration`, which currently
 * declines the recommendation on purpose.
 */
export class AdaptiveProtocolSelector {
  private readonly factory: ProtocolFactory;
  private readonly analyzer: ISharedTaskAnalyzer;
  private readonly config: Required<
    Omit<AdaptiveProtocolConfig, 'logger' | 'protocolOptions' | 'classifierConfig'>
  >;
  private readonly log: ILogger;

  constructor(config?: AdaptiveProtocolConfig) {
    this.factory = new ProtocolFactory(config?.protocolOptions);
    this.analyzer = createSharedTaskAnalyzer();
    this.config = {
      protocolMapping: config?.protocolMapping ?? DEFAULT_PROTOCOL_MAPPING,
      logDecisions: config?.logDecisions ?? true,
    };
    this.log = config?.logger ?? logger;
  }

  /**
   * Classify a task and report which protocol adaptation would choose.
   *
   * The returned `pattern` is always `config.pattern`: `CollaborationPattern`
   * has no `auto` member, so there is no way for a caller to defer to
   * adaptation. `adaptivePattern` carries the advisory choice (#4833).
   *
   * @param config - Collaboration config; its `pattern` is always honoured
   * @returns The pattern in use, the advisory choice, and the classification
   */
  selectProtocol(config: CollaborationConfig): SelectionResult {
    const explicitPattern = config.pattern;

    // Classify the task using SharedTaskAnalyzer (canonical path per ADR-0004)
    const reasoningResult = this.analyzer.getReasoningType(config.task);
    const classification: ClassificationResult = {
      type: reasoningResult.type,
      confidence: reasoningResult.confidence,
    };

    // Look up the protocol for this task type
    const mapping = this.config.protocolMapping;
    const selectedPattern =
      mapping[classification.type] ?? DEFAULT_PROTOCOL_MAPPING[classification.type];

    const wasOverridden = explicitPattern !== selectedPattern;

    if (this.config.logDecisions) {
      // Named as advisory: this logged 'Protocol selection' with
      // `wasOverridden`, which read as a live choice that had been reversed.
      // No choice is made here — `explicitPattern` is always what runs.
      this.log.info('Protocol classification (advisory)', {
        taskType: classification.type,
        confidence: classification.confidence,
        adaptivePattern: selectedPattern,
        patternInUse: explicitPattern,
        differsFromAdaptive: wasOverridden,
      });
    }

    return {
      // Always the caller's pattern — the ternary this replaced returned
      // `explicitPattern` in both branches, since the false branch is reached
      // only when the two are equal (#4833).
      pattern: explicitPattern,
      adaptivePattern: selectedPattern,
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
   * Get the recommended protocol for a task without executing.
   *
   * Returns the *adaptive* choice. It previously returned `selection.pattern`
   * — the caller's own input — so the "recommendation" echoed the question
   * back with reasoning attached that read as an answer (#4833).
   */
  getRecommendation(config: CollaborationConfig): {
    recommendedPattern: CollaborationPattern;
    taskType: TaskType;
    confidence: number;
    reasoning: string;
  } {
    const selection = this.selectProtocol(config);
    const { type, confidence } = selection.classification;

    const reasoning =
      type === 'unknown'
        ? 'Task type could not be determined with sufficient confidence. Using default protocol.'
        : `Task classified as "${type}" type (confidence: ${(confidence * 100).toFixed(0)}%). ${
            type === 'reasoning'
              ? 'Voting/parallel protocols work better for reasoning tasks (+13.2%).'
              : 'Consensus protocols work better for knowledge tasks (+2.8%).'
          }`;

    return {
      recommendedPattern: selection.adaptivePattern,
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
