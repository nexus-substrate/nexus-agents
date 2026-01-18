/**
 * Puppeteer Orchestration Events
 *
 * Event definitions and emitters for Puppeteer orchestration observability.
 *
 * @module agents/orchestration/puppeteer-events
 * (Source: Issue #335, arXiv:2505.19591)
 */

import { randomUUID } from 'node:crypto';
import type { DomainEvent, IEventBus } from '../collaboration/event-bus-types.js';
import type { Task } from '../../core/index.js';
import type {
  PuppeteerResult,
  PuppeteerStepResult,
  EmergentPatterns,
  PuppeteerMetrics,
} from './puppeteer-types.js';

// =============================================================================
// Event Topics
// =============================================================================

/**
 * Event topics for Puppeteer orchestration.
 */
export const PuppeteerTopics = {
  /** Orchestration session started */
  STARTED: 'puppeteer.started',
  /** Single step completed */
  STEP_COMPLETED: 'puppeteer.step.completed',
  /** Agent selected */
  AGENT_SELECTED: 'puppeteer.agent.selected',
  /** State updated */
  STATE_UPDATED: 'puppeteer.state.updated',
  /** Pattern detected */
  PATTERN_DETECTED: 'puppeteer.pattern.detected',
  /** Orchestration completed */
  COMPLETED: 'puppeteer.completed',
  /** Error occurred */
  ERROR: 'puppeteer.error',
  /** Cancelled */
  CANCELLED: 'puppeteer.cancelled',
} as const;

export type PuppeteerTopic = (typeof PuppeteerTopics)[keyof typeof PuppeteerTopics];

// =============================================================================
// Event Payloads
// =============================================================================

/**
 * Payload for orchestration started event.
 */
export interface PuppeteerStartedPayload {
  /** Session identifier */
  readonly sessionId: string;
  /** Task being orchestrated */
  readonly taskId: string;
  /** Task description */
  readonly taskDescription: string;
  /** Number of available agents */
  readonly agentCount: number;
  /** Configuration summary */
  readonly config: {
    readonly maxSteps: number;
    readonly timeoutMs: number;
    readonly policyMode: string;
  };
}

/**
 * Payload for step completed event.
 */
export interface PuppeteerStepCompletedPayload {
  /** Session identifier */
  readonly sessionId: string;
  /** Step number */
  readonly step: number;
  /** Selected agent ID */
  readonly selectedAgent: string;
  /** Selection probability */
  readonly selectionProbability: number;
  /** Step duration in ms */
  readonly durationMs: number;
  /** Tokens used */
  readonly tokensUsed: number;
  /** Reward for this step */
  readonly reward: number;
  /** Current progress */
  readonly progress: number;
  /** Whether this step terminates orchestration */
  readonly shouldTerminate: boolean;
}

/**
 * Payload for agent selected event.
 */
export interface PuppeteerAgentSelectedPayload {
  /** Session identifier */
  readonly sessionId: string;
  /** Step number */
  readonly step: number;
  /** Selected agent ID */
  readonly selectedAgent: string;
  /** Top candidates with probabilities */
  readonly topCandidates: readonly { agentId: string; probability: number }[];
  /** Selection reasoning */
  readonly reasoning: string;
}

/**
 * Payload for state updated event.
 */
export interface PuppeteerStateUpdatedPayload {
  /** Session identifier */
  readonly sessionId: string;
  /** Current step */
  readonly step: number;
  /** Progress estimate */
  readonly progress: number;
  /** Total tokens so far */
  readonly totalTokens: number;
  /** Total cost so far */
  readonly totalCost: number;
  /** Elapsed time in ms */
  readonly elapsedMs: number;
}

/**
 * Payload for pattern detected event.
 */
export interface PuppeteerPatternDetectedPayload {
  /** Session identifier */
  readonly sessionId: string;
  /** Detected patterns */
  readonly patterns: EmergentPatterns;
  /** Whether compaction is significant */
  readonly hasSignificantCompaction: boolean;
  /** Whether cyclicality is significant */
  readonly hasSignificantCyclicality: boolean;
}

/**
 * Payload for orchestration completed event.
 */
export interface PuppeteerCompletedPayload {
  /** Session identifier */
  readonly sessionId: string;
  /** Whether task completed successfully */
  readonly success: boolean;
  /** Termination reason */
  readonly terminationReason: string;
  /** Total steps executed */
  readonly totalSteps: number;
  /** Total duration in ms */
  readonly totalDurationMs: number;
  /** Total tokens used */
  readonly totalTokens: number;
  /** Total cost */
  readonly totalCost: number;
  /** Final metrics */
  readonly metrics: PuppeteerMetrics;
  /** Emergent patterns summary */
  readonly patterns: {
    hubCount: number;
    cycleCount: number;
    graphDensity: number;
  };
}

/**
 * Payload for error event.
 */
export interface PuppeteerErrorPayload {
  /** Session identifier */
  readonly sessionId: string;
  /** Error code */
  readonly code: string;
  /** Error message */
  readonly message: string;
  /** Step where error occurred (if applicable) */
  readonly step?: number;
}

// =============================================================================
// Typed Events
// =============================================================================

/** Puppeteer started event. */
export interface PuppeteerStartedEvent extends DomainEvent {
  readonly topic: typeof PuppeteerTopics.STARTED;
  readonly payload: PuppeteerStartedPayload;
}

/** Puppeteer step completed event. */
export interface PuppeteerStepCompletedEvent extends DomainEvent {
  readonly topic: typeof PuppeteerTopics.STEP_COMPLETED;
  readonly payload: PuppeteerStepCompletedPayload;
}

/** Puppeteer agent selected event. */
export interface PuppeteerAgentSelectedEvent extends DomainEvent {
  readonly topic: typeof PuppeteerTopics.AGENT_SELECTED;
  readonly payload: PuppeteerAgentSelectedPayload;
}

/** Puppeteer state updated event. */
export interface PuppeteerStateUpdatedEvent extends DomainEvent {
  readonly topic: typeof PuppeteerTopics.STATE_UPDATED;
  readonly payload: PuppeteerStateUpdatedPayload;
}

/** Puppeteer pattern detected event. */
export interface PuppeteerPatternDetectedEvent extends DomainEvent {
  readonly topic: typeof PuppeteerTopics.PATTERN_DETECTED;
  readonly payload: PuppeteerPatternDetectedPayload;
}

/** Puppeteer completed event. */
export interface PuppeteerCompletedEvent extends DomainEvent {
  readonly topic: typeof PuppeteerTopics.COMPLETED;
  readonly payload: PuppeteerCompletedPayload;
}

/** Puppeteer error event. */
export interface PuppeteerErrorEvent extends DomainEvent {
  readonly topic: typeof PuppeteerTopics.ERROR;
  readonly payload: PuppeteerErrorPayload;
}

// =============================================================================
// Event Emitters
// =============================================================================

/**
 * Emit orchestration started event.
 */
export function emitPuppeteerStarted(
  eventBus: IEventBus,
  sessionId: string,
  task: Task,
  agentCount: number = 0,
  config: PuppeteerStartedPayload['config'] = {
    maxSteps: 10,
    timeoutMs: 300000,
    policyMode: 'rule_based',
  }
): void {
  const event: PuppeteerStartedEvent = {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    topic: PuppeteerTopics.STARTED,
    sessionId,
    payload: {
      sessionId,
      taskId: task.id,
      taskDescription: task.description.slice(0, 200),
      agentCount,
      config,
    },
  };
  eventBus.emit(event);
}

/**
 * Emit step completed event.
 */
export function emitPuppeteerStepCompleted(
  eventBus: IEventBus,
  sessionId: string,
  step: PuppeteerStepResult
): void {
  const probability = step.distribution.probabilities.get(step.selectedAgent) ?? 0;
  const event: PuppeteerStepCompletedEvent = {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    topic: PuppeteerTopics.STEP_COMPLETED,
    sessionId,
    payload: {
      sessionId,
      step: step.newState.step,
      selectedAgent: step.selectedAgent,
      selectionProbability: probability,
      durationMs: step.agentOutput.durationMs,
      tokensUsed: step.agentOutput.tokensUsed,
      reward: step.reward,
      progress: step.newState.metadata.progress,
      shouldTerminate: step.shouldTerminate,
    },
  };
  eventBus.emit(event);
}

/**
 * Emit orchestration completed event.
 */
export function emitPuppeteerCompleted(
  eventBus: IEventBus,
  sessionId: string,
  result: PuppeteerResult
): void {
  const event: PuppeteerCompletedEvent = {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    topic: PuppeteerTopics.COMPLETED,
    sessionId,
    payload: {
      sessionId,
      success: result.success,
      terminationReason: result.terminationReason,
      totalSteps: result.totalSteps,
      totalDurationMs: result.totalDurationMs,
      totalTokens: result.totalTokens,
      totalCost: result.totalCost,
      metrics: result.metrics,
      patterns: {
        hubCount: result.emergentPatterns.hubAgents.length,
        cycleCount: result.emergentPatterns.cycles.length,
        graphDensity: result.emergentPatterns.graphDensity,
      },
    },
  };
  eventBus.emit(event);
}

/**
 * Emit error event.
 */
export function emitPuppeteerError(
  eventBus: IEventBus,
  sessionId: string,
  error: { code?: string; message: string },
  step?: number
): void {
  const basePayload: PuppeteerErrorPayload = {
    sessionId,
    code: error.code ?? 'UNKNOWN_ERROR',
    message: error.message,
  };

  const payload: PuppeteerErrorPayload =
    step !== undefined ? { ...basePayload, step } : basePayload;

  const event: PuppeteerErrorEvent = {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    topic: PuppeteerTopics.ERROR,
    sessionId,
    payload,
  };
  eventBus.emit(event);
}

/**
 * Emit pattern detected event.
 */
export function emitPuppeteerPatternDetected(
  eventBus: IEventBus,
  sessionId: string,
  patterns: EmergentPatterns
): void {
  const event: PuppeteerPatternDetectedEvent = {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    topic: PuppeteerTopics.PATTERN_DETECTED,
    sessionId,
    payload: {
      sessionId,
      patterns,
      hasSignificantCompaction: patterns.hubAgents.some((h) => h.percentage > 0.5),
      hasSignificantCyclicality: patterns.cyclicalityScore > 0.4,
    },
  };
  eventBus.emit(event);
}
