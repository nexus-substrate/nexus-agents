/**
 * nexus-agents/utils - ID Generation Utilities
 *
 * Shared utility functions for generating unique identifiers.
 * Consolidates duplicate generateId implementations per ADR-0013.
 *
 * Uses getTimeProvider and getRandomProvider for deterministic testing.
 *
 * @module utils/id-utils
 * @see docs/adr/0013-memory-helpers-consolidation.md
 */

import { randomUUID } from 'node:crypto';
import { getTimeProvider, getRandomProvider } from '../core/index.js';

/**
 * Generate a unique ID with prefix using timestamp and random suffix.
 *
 * Format: `${prefix}_${timestamp}_${random}` (underscore-separated)
 *
 * Uses getTimeProvider() and getRandomProvider() for deterministic testing.
 *
 * @param prefix - ID prefix (e.g., 'belief', 'update', 'exec')
 * @param randomLength - Length of random suffix (default: 8)
 * @returns Unique ID string
 *
 * @example
 * ```typescript
 * const beliefId = generateId('belief');  // 'belief_1p5k3x2_a1b2c3d4'
 * const execId = generateId('exec', 6);   // 'exec_1p5k3x2_a1b2c3'
 * ```
 */
export function generateId(prefix: string, randomLength = 8): string {
  const timestamp = getTimeProvider().now().toString(36);
  const random = getRandomProvider()
    .random()
    .toString(36)
    .substring(2, 2 + randomLength);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Generate a unique ID with hyphen separators.
 *
 * Format: `${prefix}-${timestamp}-${random}` (hyphen-separated)
 *
 * @param prefix - ID prefix
 * @param randomLength - Length of random suffix (default: 6)
 * @returns Unique ID string
 *
 * @example
 * ```typescript
 * const id = generateHyphenId('workflow');  // 'workflow-1769876392192-a1b2c3'
 * ```
 */
export function generateHyphenId(prefix: string, randomLength = 6): string {
  const timestamp = String(getTimeProvider().now());
  const random = getRandomProvider()
    .random()
    .toString(36)
    .slice(2, 2 + randomLength);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Generate a short unique ID using randomUUID.
 *
 * Format: `${prefix}-${shortUuid}` where shortUuid is first 8 chars of UUID.
 *
 * @param prefix - ID prefix
 * @returns Short unique ID string
 *
 * @example
 * ```typescript
 * const id = generateShortUuid('workflow');  // 'workflow-a1b2c3d4'
 * ```
 */
export function generateShortUuid(prefix: string): string {
  // Use random provider for determinism, generate UUID-like pattern
  const rand1 = getRandomProvider().random().toString(16).substring(2, 6);
  const rand2 = getRandomProvider().random().toString(16).substring(2, 6);
  return `${prefix}-${rand1}${rand2}`;
}

// ============================================================================
// UUID Generation (node:crypto)
// ============================================================================

/**
 * Generates a UUID v4 using node:crypto.randomUUID().
 * This is the canonical UUID generator - use instead of `uuid` package.
 *
 * Note: This uses node:crypto directly for performance. For deterministic
 * testing scenarios, use generateId() or generateShortUuid() instead.
 *
 * @returns A UUID v4 string
 *
 * @example
 * ```typescript
 * const id = generateUUID(); // 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
 * ```
 */
export function generateUUID(): string {
  return randomUUID();
}

/**
 * Generates a short UUID (first 8 characters).
 * Useful for display purposes or step IDs.
 *
 * @param prefix - Optional prefix for the ID
 * @returns A short UUID string, optionally prefixed
 *
 * @example
 * ```typescript
 * const id = generateShortUUIDv4();           // 'f47ac10b'
 * const stepId = generateShortUUIDv4('step'); // 'step-f47ac10b'
 * ```
 */
export function generateShortUUIDv4(prefix?: string): string {
  const shortId = randomUUID().slice(0, 8);
  return prefix !== undefined ? `${prefix}-${shortId}` : shortId;
}

/**
 * Generates a step ID using UUID.
 * Replacement for `step-${uuidv4().slice(0, 8)}` pattern.
 *
 * @param prefix - Prefix for the step ID (default: 'step')
 * @returns A prefixed short UUID
 */
export function generateStepId(prefix = 'step'): string {
  return generateShortUUIDv4(prefix);
}

/**
 * Alias for generateUUID - compatibility with `uuid` package's v4.
 * @deprecated Use generateUUID() instead for new code.
 */
export const uuidv4 = generateUUID;
