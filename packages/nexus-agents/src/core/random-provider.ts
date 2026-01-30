/**
 * Injectable Random Provider
 *
 * Provides a deterministic interface for random number generation.
 * Supports seeded randomness for reproducible tests and builds.
 *
 * @module core/random-provider
 * (Source: System Mandate - Determinism improvement)
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Interface for random number generation.
 * Inject this instead of using Math.random() directly.
 */
export interface IRandomProvider {
  /**
   * Generate a random number between 0 (inclusive) and 1 (exclusive).
   * Equivalent to Math.random() but potentially seeded.
   */
  random(): number;

  /**
   * Generate a random integer between min (inclusive) and max (exclusive).
   */
  randomInt(min: number, max: number): number;

  /**
   * Generate a random string of given length.
   */
  randomString(length: number): string;

  /**
   * Pick a random element from an array.
   */
  randomChoice<T>(items: readonly T[]): T | undefined;

  /**
   * Shuffle an array (returns new array).
   */
  shuffle<T>(items: readonly T[]): T[];

  /**
   * Generate a random UUID v4.
   */
  uuid(): string;
}

/**
 * Configuration for random provider.
 */
export interface RandomProviderConfig {
  /**
   * Seed for deterministic randomness.
   * If not set, uses Math.random() (non-deterministic).
   */
  readonly seed?: number;
}

// ============================================================================
// Implementation
// ============================================================================

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * System random provider using Math.random().
 * Non-deterministic.
 */
export class SystemRandomProvider implements IRandomProvider {
  random(): number {
    return Math.random();
  }

  randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min)) + min;
  }

  randomString(length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      const char = CHARS[this.randomInt(0, CHARS.length)];
      if (char !== undefined) {
        result += char;
      }
    }
    return result;
  }

  randomChoice<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[this.randomInt(0, items.length)];
  }

  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.randomInt(0, i + 1);
      const temp = result[i];
      const swap = result[j];
      if (temp !== undefined && swap !== undefined) {
        result[i] = swap;
        result[j] = temp;
      }
    }
    return result;
  }

  uuid(): string {
    const hex = (): string => this.randomInt(0, 16).toString(16);
    const s4 = (): string => hex() + hex() + hex() + hex();
    return `${s4()}${s4()}-${s4()}-4${hex()}${hex()}${hex()}-${hex()}${hex()}${hex()}${hex()}-${s4()}${s4()}${s4()}`;
  }
}

/**
 * Seeded random provider using mulberry32 algorithm.
 * Deterministic given the same seed.
 */
export class SeededRandomProvider implements IRandomProvider {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /**
   * Mulberry32 PRNG - simple, fast, good distribution.
   */
  random(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min)) + min;
  }

  randomString(length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      const char = CHARS[this.randomInt(0, CHARS.length)];
      if (char !== undefined) {
        result += char;
      }
    }
    return result;
  }

  randomChoice<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[this.randomInt(0, items.length)];
  }

  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.randomInt(0, i + 1);
      const temp = result[i];
      const swap = result[j];
      if (temp !== undefined && swap !== undefined) {
        result[i] = swap;
        result[j] = temp;
      }
    }
    return result;
  }

  uuid(): string {
    const hex = (): string => this.randomInt(0, 16).toString(16);
    const s4 = (): string => hex() + hex() + hex() + hex();
    return `${s4()}${s4()}-${s4()}-4${hex()}${hex()}${hex()}-${hex()}${hex()}${hex()}${hex()}-${s4()}${s4()}${s4()}`;
  }

  /**
   * Reset the PRNG to a new seed.
   */
  reset(seed: number): void {
    this.state = seed;
  }
}

// ============================================================================
// Global Instance
// ============================================================================

let globalRandomProvider: IRandomProvider = new SystemRandomProvider();

/**
 * Get the global random provider instance.
 */
export function getRandomProvider(): IRandomProvider {
  return globalRandomProvider;
}

/**
 * Set the global random provider instance.
 * Use for testing or deterministic mode.
 */
export function setRandomProvider(provider: IRandomProvider): void {
  globalRandomProvider = provider;
}

/**
 * Reset the global random provider to system random.
 */
export function resetRandomProvider(): void {
  globalRandomProvider = new SystemRandomProvider();
}

/**
 * Creates a random provider.
 */
export function createRandomProvider(config?: RandomProviderConfig): IRandomProvider {
  if (config?.seed !== undefined) {
    return new SeededRandomProvider(config.seed);
  }
  return new SystemRandomProvider();
}
