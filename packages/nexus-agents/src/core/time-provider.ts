/**
 * Injectable Time Provider
 *
 * Provides a deterministic interface for time operations.
 * Allows injection of mock time for testing and reproducible builds.
 *
 * @module core/time-provider
 * (Source: System Mandate - Determinism improvement)
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Interface for time operations.
 * Inject this instead of using Date.now() directly.
 */
export interface ITimeProvider {
  /**
   * Get current timestamp in milliseconds.
   * Equivalent to Date.now() but injectable.
   */
  now(): number;

  /**
   * Get current date as ISO string.
   * Equivalent to new Date().toISOString() but injectable.
   */
  nowIso(): string;

  /**
   * Get current Date object.
   */
  nowDate(): Date;

  /**
   * Get current date as YYYY-MM-DD string.
   * Consolidates the common pattern: nowIso().split('T')[0]
   */
  nowDateString(): string;
}

/**
 * Configuration for time provider.
 */
export interface TimeProviderConfig {
  /**
   * Fixed timestamp for deterministic mode.
   * If set, now() always returns this value.
   */
  readonly fixedTime?: number;

  /**
   * Offset to add to real time.
   * Useful for testing time-sensitive logic.
   */
  readonly offsetMs?: number;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Default time provider using system clock.
 */
export class SystemTimeProvider implements ITimeProvider {
  private readonly offsetMs: number;

  constructor(config?: TimeProviderConfig) {
    this.offsetMs = config?.offsetMs ?? 0;
  }

  now(): number {
    return Date.now() + this.offsetMs;
  }

  nowIso(): string {
    return new Date(this.now()).toISOString();
  }

  nowDate(): Date {
    return new Date(this.now());
  }

  nowDateString(): string {
    return this.nowIso().split('T')[0] ?? '';
  }
}

/**
 * Fixed time provider for deterministic testing.
 * Always returns the same timestamp.
 */
export class FixedTimeProvider implements ITimeProvider {
  private currentTime: number;

  constructor(fixedTime: number | Date = Date.now()) {
    this.currentTime = typeof fixedTime === 'number' ? fixedTime : fixedTime.getTime();
  }

  now(): number {
    return this.currentTime;
  }

  nowIso(): string {
    return new Date(this.currentTime).toISOString();
  }

  nowDate(): Date {
    return new Date(this.currentTime);
  }

  nowDateString(): string {
    return this.nowIso().split('T')[0] ?? '';
  }

  /**
   * Advance the fixed time by the given amount.
   */
  advance(ms: number): void {
    this.currentTime += ms;
  }

  /**
   * Set the fixed time to a new value.
   */
  setTime(time: number | Date): void {
    this.currentTime = typeof time === 'number' ? time : time.getTime();
  }
}

// ============================================================================
// Global Instance
// ============================================================================

let globalTimeProvider: ITimeProvider = new SystemTimeProvider();

/**
 * Get the global time provider instance.
 */
export function getTimeProvider(): ITimeProvider {
  return globalTimeProvider;
}

/**
 * Set the global time provider instance.
 * Use for testing or deterministic mode.
 */
export function setTimeProvider(provider: ITimeProvider): void {
  globalTimeProvider = provider;
}

/**
 * Get current date as YYYY-MM-DD string using the global time provider.
 * Test-mockable via setTimeProvider(). Canonical source for date strings.
 * @see Issue #1596 — DRY consolidation
 */
export function getCurrentDateString(): string {
  return new Date(getTimeProvider().now()).toISOString().slice(0, 10);
}

/**
 * Reset the global time provider to system clock.
 */
export function resetTimeProvider(): void {
  globalTimeProvider = new SystemTimeProvider();
}

/**
 * Creates a time provider.
 */
export function createTimeProvider(config?: TimeProviderConfig): ITimeProvider {
  if (config?.fixedTime !== undefined) {
    return new FixedTimeProvider(config.fixedTime);
  }
  return new SystemTimeProvider(config);
}
