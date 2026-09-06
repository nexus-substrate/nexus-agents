/**
 * nexus-agents/agents/resilience - Failure Detector
 *
 * Detects agent failure archetypes from arxiv:2512.07497 by analyzing
 * agent behavior, outputs, and execution patterns.
 */

import type { Message, ILogger } from '../../core/index.js';
import { createLogger, getTimeProvider } from '../../core/index.js';
import type {
  FailureArchetype,
  DetectedFailure,
  DetectionResult,
  DetectorConfig,
} from './failure-types.js';
import { DEFAULT_DETECTOR_CONFIG, DetectorConfigSchema } from './failure-types.js';

/** Input for failure detection analysis. */
export interface DetectionInput {
  readonly messages: readonly Message[];
  readonly toolCalls?: readonly ToolCallRecord[];
  readonly output?: unknown;
  readonly taskDescription?: string;
}

/** Record of a tool call for analysis. */
export interface ToolCallRecord {
  readonly name: string;
  readonly input: unknown;
  readonly output?: unknown;
  readonly success: boolean;
  readonly errorMessage?: string;
}

/** Heuristic indicators for premature action detection. */
const PREMATURE_ACTION_INDICATORS = [
  /guessing|assuming|probably|likely|might be/i,
  /without checking|didn't verify|skipping validation/i,
  /default.*(schema|format|structure)/i,
];

/** Heuristic indicators for over-helpfulness detection. */
const OVER_HELPFULNESS_INDICATORS = [
  /substitut(e|ed|ing)|replac(e|ed|ing).*(missing|unavailable)/i,
  /using.*(alternative|placeholder|default)/i,
  /couldn't find.*(using|chose)/i,
];

/** Heuristic indicators for context pollution. */
const CONTEXT_POLLUTION_INDICATORS = [
  /conflicting|contradictory|inconsistent/i,
  /ignoring|disregarding.*(previous|earlier)/i,
  /confused by|distracted by/i,
];

/** Heuristic indicators for fragile execution. */
const FRAGILE_EXECUTION_INDICATORS = [
  /malformed|invalid|syntax error/i,
  /retry|trying again|loop/i,
  /failed to (parse|execute|complete)/i,
];

/**
 * Failure detector that analyzes agent behavior for failure archetypes.
 */
/**
 * Map a confidence score to a severity level.
 *
 * The previous form was an object keyed by number, walked with
 * `Object.entries` and last-match-wins:
 *
 * ```ts
 * const severityMap: Record<number, Severity> = { 0.3:'low', 0.5:'medium', 0.7:'high', 1.0:'critical' };
 * for (const [t, sev] of Object.entries(severityMap)) if (confidence >= parseFloat(t)) severity = sev;
 * ```
 *
 * `1.0` stringifies to the key `"1"`, which is a canonical array index, and ES
 * property enumeration puts integer-like keys FIRST — the real order is
 * `["1","0.3","0.5","0.7"]`. So at confidence 1 the loop assigned `critical`
 * and then overwrote it with `low`, `medium` and finally `high`. `critical` was
 * unreachable for every possible input, while `FailureSeverity` and its Zod
 * enum both published it as a state a consumer could expect.
 *
 * An ordered array of thresholds cannot develop that defect: the order is the
 * literal's own, and it is the thing under test.
 */
const SEVERITY_THRESHOLDS: readonly (readonly [number, DetectedFailure['severity']])[] = [
  [0.3, 'low'],
  [0.5, 'medium'],
  [0.7, 'high'],
  [1.0, 'critical'],
];

export function severityForConfidence(confidence: number): DetectedFailure['severity'] {
  let severity: DetectedFailure['severity'] = 'low';
  for (const [threshold, level] of SEVERITY_THRESHOLDS) {
    if (confidence >= threshold) severity = level;
  }
  return severity;
}

export class FailureDetector {
  private readonly config: DetectorConfig;
  private readonly logger: ILogger;

  constructor(config: Partial<DetectorConfig> = {}, logger?: ILogger) {
    const mergedConfig = { ...DEFAULT_DETECTOR_CONFIG, ...config };
    const parsed = DetectorConfigSchema.safeParse(mergedConfig);
    if (!parsed.success) {
      throw new Error(`Invalid detector config: ${parsed.error.message}`);
    }
    this.config = parsed.data;
    this.logger = logger ?? createLogger({ component: 'FailureDetector' });
  }

  /**
   * Analyzes agent behavior for failure archetypes.
   */
  detect(input: DetectionInput): DetectionResult {
    const startTime = getTimeProvider().now();
    const failures: DetectedFailure[] = [];
    let checksPerformed = 0;
    let contentAnalyzed = 0;

    contentAnalyzed += input.messages.length;
    if (input.toolCalls) contentAnalyzed += input.toolCalls.length;

    for (const archetype of this.config.enabledArchetypes) {
      checksPerformed++;
      const failure = this.detectArchetype(archetype, input);
      if (failure !== null && failure.confidence >= this.config.confidenceThreshold) {
        failures.push(failure);
      }
    }

    const durationMs = getTimeProvider().now() - startTime;
    this.logger.debug('Detection complete', {
      hasFailure: failures.length > 0,
      failureCount: failures.length,
      durationMs,
    });

    return {
      hasFailure: failures.length > 0,
      failures,
      analysisMetadata: { durationMs, checksPerformed, contentAnalyzed },
    };
  }

  /** Detects a specific archetype in the input. */
  private detectArchetype(
    archetype: FailureArchetype,
    input: DetectionInput
  ): DetectedFailure | null {
    switch (archetype) {
      case 'premature_action':
        return this.detectPrematureAction(input);
      case 'over_helpfulness':
        return this.detectOverHelpfulness(input);
      case 'context_pollution':
        return this.detectContextPollution(input);
      case 'fragile_execution':
        return this.detectFragileExecution(input);
      default:
        return null;
    }
  }

  /** Detects premature action failure pattern. */
  private detectPrematureAction(input: DetectionInput): DetectedFailure | null {
    const indicators: string[] = [];
    let confidence = 0;

    if (this.config.enableHeuristics) {
      const textContent = this.extractTextContent(input.messages);
      for (const pattern of PREMATURE_ACTION_INDICATORS) {
        if (pattern.test(textContent)) {
          indicators.push(`Pattern match: ${pattern.source}`);
          confidence += 0.2;
        }
      }
    }

    if (input.toolCalls) {
      const hasSchemaInspection = input.toolCalls.some(
        (tc) =>
          tc.name.includes('schema') || tc.name.includes('inspect') || tc.name.includes('describe')
      );
      const hasDataAction = input.toolCalls.some(
        (tc) =>
          tc.name.includes('create') || tc.name.includes('update') || tc.name.includes('execute')
      );

      if (hasDataAction && !hasSchemaInspection) {
        indicators.push('Data modification without schema inspection');
        confidence += 0.4;
      }
    }

    if (indicators.length === 0) return null;

    return this.createFailure('premature_action', indicators, Math.min(confidence, 1));
  }

  /** Detects over-helpfulness failure pattern. */
  private detectOverHelpfulness(input: DetectionInput): DetectedFailure | null {
    const indicators: string[] = [];
    let confidence = 0;

    if (this.config.enableHeuristics) {
      const textContent = this.extractTextContent(input.messages);
      for (const pattern of OVER_HELPFULNESS_INDICATORS) {
        if (pattern.test(textContent)) {
          indicators.push(`Pattern match: ${pattern.source}`);
          confidence += 0.25;
        }
      }
    }

    if (input.toolCalls) {
      const failedLookups = input.toolCalls.filter(
        (tc) => !tc.success && (tc.name.includes('get') || tc.name.includes('find'))
      );
      const subsequentActions = input.toolCalls.filter(
        (tc) => tc.success && (tc.name.includes('create') || tc.name.includes('use'))
      );

      if (failedLookups.length > 0 && subsequentActions.length > 0) {
        indicators.push('Action taken after failed lookup (possible substitution)');
        confidence += 0.35;
      }
    }

    if (indicators.length === 0) return null;

    return this.createFailure('over_helpfulness', indicators, Math.min(confidence, 1));
  }

  /** Detects context pollution failure pattern. */
  private detectContextPollution(input: DetectionInput): DetectedFailure | null {
    const indicators: string[] = [];
    let confidence = 0;

    if (this.config.enableHeuristics) {
      const textContent = this.extractTextContent(input.messages);
      for (const pattern of CONTEXT_POLLUTION_INDICATORS) {
        if (pattern.test(textContent)) {
          indicators.push(`Pattern match: ${pattern.source}`);
          confidence += 0.2;
        }
      }
    }

    const recentMessages = input.messages.slice(-this.config.maxHistoryItems);
    if (recentMessages.length > 10) {
      const topicShifts = this.countTopicShifts(recentMessages);
      if (topicShifts > 3) {
        indicators.push(`High topic shifts detected: ${String(topicShifts)}`);
        confidence += 0.3;
      }
    }

    if (indicators.length === 0) return null;

    return this.createFailure('context_pollution', indicators, Math.min(confidence, 1));
  }

  /** Detects fragile execution failure pattern. */
  private detectFragileExecution(input: DetectionInput): DetectedFailure | null {
    const indicators: string[] = [];
    let confidence = 0;

    if (this.config.enableHeuristics) {
      const textContent = this.extractTextContent(input.messages);
      for (const pattern of FRAGILE_EXECUTION_INDICATORS) {
        if (pattern.test(textContent)) {
          indicators.push(`Pattern match: ${pattern.source}`);
          confidence += 0.2;
        }
      }
    }

    if (input.toolCalls) {
      const failedCalls = input.toolCalls.filter((tc) => !tc.success);
      const failureRate = failedCalls.length / input.toolCalls.length;

      if (failureRate > 0.5 && input.toolCalls.length >= 3) {
        indicators.push(`High tool failure rate: ${(failureRate * 100).toFixed(0)}%`);
        confidence += 0.4;
      }

      const repeatedCalls = this.findRepeatedCalls(input.toolCalls);
      if (repeatedCalls.length > 0) {
        indicators.push(`Repeated tool calls detected: ${repeatedCalls.join(', ')}`);
        confidence += 0.3;
      }
    }

    if (indicators.length === 0) return null;

    return this.createFailure('fragile_execution', indicators, Math.min(confidence, 1));
  }

  /** Extracts text content from messages. */
  private extractTextContent(messages: readonly Message[]): string {
    return messages
      .filter((m) => m.role === 'assistant')
      .map((m) => {
        if (typeof m.content === 'string') return m.content;
        return m.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join(' ');
      })
      .join('\n');
  }

  /** Counts approximate topic shifts in messages. */
  private countTopicShifts(messages: readonly Message[]): number {
    let shifts = 0;
    let previousTopics = new Set<string>();

    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : '';
      const words = content.toLowerCase().split(/\s+/).slice(0, 20);
      const currentTopics = new Set(words.filter((w) => w.length > 4));

      const overlap = [...currentTopics].filter((t) => previousTopics.has(t)).length;
      if (previousTopics.size > 0 && overlap < previousTopics.size * 0.3) {
        shifts++;
      }

      previousTopics = currentTopics;
    }

    return shifts;
  }

  /** Finds tool calls that are repeated (possible retry loops). */
  private findRepeatedCalls(toolCalls: readonly ToolCallRecord[]): string[] {
    const callCounts = new Map<string, number>();
    for (const tc of toolCalls) {
      callCounts.set(tc.name, (callCounts.get(tc.name) ?? 0) + 1);
    }
    return [...callCounts.entries()].filter(([, count]) => count >= 3).map(([name]) => name);
  }

  /** Creates a detected failure object. */
  private createFailure(
    archetype: FailureArchetype,
    indicators: string[],
    confidence: number
  ): DetectedFailure {
    const severity = severityForConfidence(confidence);

    return {
      archetype,
      severity,
      description: this.getArchetypeDescription(archetype),
      indicators,
      confidence,
      timestamp: getTimeProvider().now(),
    };
  }

  /** Gets human-readable description for archetype. */
  private getArchetypeDescription(archetype: FailureArchetype): string {
    const descriptions: Record<FailureArchetype, string> = {
      premature_action: 'Agent acted without proper inspection of schemas or available data',
      over_helpfulness: 'Agent substituted missing data with plausible alternatives',
      context_pollution: 'Agent reasoning corrupted by irrelevant context information',
      fragile_execution: 'Agent produced malformed tool calls or entered execution loops',
    };
    return descriptions[archetype];
  }
}

/**
 * Creates a failure detector with the specified configuration.
 */
export function createFailureDetector(
  config?: Partial<DetectorConfig>,
  logger?: ILogger
): FailureDetector {
  return new FailureDetector(config, logger);
}
