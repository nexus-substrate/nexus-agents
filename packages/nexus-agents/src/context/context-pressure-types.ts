/**
 * nexus-agents/context - Context Pressure Types
 *
 * Type definitions for the context pressure monitor. Tracks cumulative
 * token usage across waves and emits warnings at configurable thresholds.
 *
 * (Source: Context Exhaustion Prevention - Issue #769 follow-up)
 *
 * @module context/context-pressure-types
 */

// ============================================================================
// Pressure Levels
// ============================================================================

/** Context pressure level based on token utilization. */
export type PressureLevel = 'normal' | 'info' | 'warning' | 'critical';

// ============================================================================
// Configuration
// ============================================================================

/** Configuration for the context pressure monitor. */
export interface ContextPressureConfig {
  /** Maximum context token capacity. Default: 95000. */
  readonly maxContextTokens: number;
  /** Utilization ratio (0-1) at which to emit info. Default: 0.60. */
  readonly infoThreshold: number;
  /** Utilization ratio (0-1) at which to emit warning. Default: 0.75. */
  readonly warnThreshold: number;
  /** Utilization ratio (0-1) at which to emit critical. Default: 0.85. */
  readonly criticalThreshold: number;
}

/** Default context pressure configuration. */
export const DEFAULT_PRESSURE_CONFIG: ContextPressureConfig = {
  maxContextTokens: 95_000,
  infoThreshold: 0.6,
  warnThreshold: 0.75,
  criticalThreshold: 0.85,
};

// ============================================================================
// Events & Stats
// ============================================================================

/** A pressure event emitted when a threshold is crossed. */
export interface PressureEvent {
  /** The pressure level reached. */
  readonly level: PressureLevel;
  /** Total tokens used so far. */
  readonly tokensUsed: number;
  /** Maximum token capacity. */
  readonly maxTokens: number;
  /** Current utilization as a percentage (0-100). */
  readonly utilizationPct: number;
  /** Human-readable recommended action. */
  readonly recommendedAction: string;
}

/** Current state of the pressure monitor. */
export interface PressureStats {
  /** Total tokens accumulated. */
  readonly tokensUsed: number;
  /** Maximum token capacity. */
  readonly maxTokens: number;
  /** Current utilization ratio (0-1). */
  readonly utilization: number;
  /** Current pressure level. */
  readonly level: PressureLevel;
}
