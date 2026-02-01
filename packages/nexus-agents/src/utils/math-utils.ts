/**
 * nexus-agents/utils - Math Utilities
 *
 * Common mathematical utility functions extracted from multiple modules.
 * Consolidates the clamp pattern: Math.max(min, Math.min(max, value))
 *
 * @module utils/math-utils
 */

// ============================================================================
// Clamping
// ============================================================================

/**
 * Clamp a value between min and max bounds.
 *
 * This consolidates the common pattern:
 * `Math.max(min, Math.min(max, value))`
 *
 * @param value - The value to clamp
 * @param min - Minimum bound (inclusive)
 * @param max - Maximum bound (inclusive)
 * @returns The clamped value
 *
 * @example
 * ```typescript
 * clamp(150, 0, 100);  // Returns 100
 * clamp(-10, 0, 100);  // Returns 0
 * clamp(50, 0, 100);   // Returns 50
 * ```
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Clamp a value between 0 and 1 (unit interval).
 *
 * Shorthand for `clamp(value, 0, 1)`.
 *
 * @param value - The value to clamp
 * @returns The value clamped to [0, 1]
 *
 * @example
 * ```typescript
 * clamp01(1.5);   // Returns 1
 * clamp01(-0.5);  // Returns 0
 * clamp01(0.7);   // Returns 0.7
 * ```
 */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * Clamp a score value between 0 and 10.
 *
 * Shorthand for `clamp(value, 0, 10)`.
 *
 * @param value - The score to clamp
 * @returns The score clamped to [0, 10]
 */
export function clampScore(value: number): number {
  return clamp(value, 0, 10);
}

/**
 * Clamp a percentage value between 0 and 100.
 *
 * Shorthand for `clamp(value, 0, 100)`.
 *
 * @param value - The percentage to clamp
 * @returns The percentage clamped to [0, 100]
 */
export function clampPercent(value: number): number {
  return clamp(value, 0, 100);
}
