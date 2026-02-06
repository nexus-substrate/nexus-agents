/**
 * nexus-agents/agents - Wave Checkpoint Types
 *
 * Type definitions and Zod schemas for wave checkpoint persistence.
 * Checkpoints capture completed wave results to disk so intermediate
 * work survives context exhaustion or process restarts.
 *
 * (Source: Context Exhaustion Prevention - Issue #769 follow-up)
 *
 * @module agents/wave-checkpoint-types
 */

import { z } from 'zod';
import type { WaveTaskResult } from './wave-scheduler-types.js';

// ============================================================================
// Schemas
// ============================================================================

/**
 * Schema for a single task result within a checkpoint.
 */
export const CheckpointTaskResultSchema = z.object({
  taskId: z.string(),
  success: z.boolean(),
  output: z.string(),
  truncated: z.boolean(),
  originalLength: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  error: z.string().optional(),
});

/**
 * Schema for a single wave checkpoint entry (one JSONL line).
 */
export const WaveCheckpointEntrySchema = z.object({
  sessionId: z.string().min(1),
  waveIndex: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
  results: z.array(CheckpointTaskResultSchema),
  totalTokens: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
});

/** A single wave checkpoint entry persisted to disk. */
export type WaveCheckpointEntry = z.infer<typeof WaveCheckpointEntrySchema>;

// ============================================================================
// Configuration
// ============================================================================

/** Configuration for wave checkpoint persistence. */
export interface WaveCheckpointConfig {
  /** Whether checkpointing is enabled. Default: true. */
  readonly enabled: boolean;
  /** Custom checkpoint directory. Default: ~/.nexus-agents/checkpoints/ */
  readonly checkpointDir?: string;
}

/** Default checkpoint configuration. */
export const DEFAULT_CHECKPOINT_CONFIG: WaveCheckpointConfig = {
  enabled: true,
};

// ============================================================================
// Summary
// ============================================================================

/** Summary of checkpoint data for a session. */
export interface CheckpointSummary {
  /** Session identifier. */
  readonly sessionId: string;
  /** Number of completed waves persisted. */
  readonly waveCount: number;
  /** Total estimated tokens across all checkpointed waves. */
  readonly totalTokens: number;
  /** Total tasks across all checkpointed waves. */
  readonly totalTasks: number;
  /** Timestamp of the last checkpoint entry. */
  readonly lastTimestamp: string;
}

// ============================================================================
// Callback
// ============================================================================

/**
 * Callback invoked after each wave completes.
 * Used by checkpoint persistence to write results to disk.
 */
export type OnWaveCompleteCallback = (
  waveIndex: number,
  results: readonly WaveTaskResult[],
  cumulativeTokens: number
) => Promise<void>;
