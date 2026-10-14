/**
 * nexus-agents/core - ANSI Colors
 *
 * Foundational ANSI color formatting utilities decoupled from presentation/CLI layers.
 * Provides NO_COLOR-compliant (https://no-color.org/) color constants and factories.
 *
 * @module core/ansi-colors
 */

// ============================================================================
// Raw ANSI Codes
// ============================================================================

/**
 * Raw ANSI escape sequences for terminal text formatting.
 */
export const RAW_ANSI = {
  /** Reset all formatting */
  reset: '\x1b[0m',
  /** Green text (success, enabled) */
  green: '\x1b[32m',
  /** Yellow text (warning, caution) */
  yellow: '\x1b[33m',
  /** Red text (error, disabled) */
  red: '\x1b[31m',
  /** Cyan text (info, highlight) */
  cyan: '\x1b[36m',
  /** Dim text (secondary info) */
  dim: '\x1b[2m',
  /** Bold text (emphasis) */
  bold: '\x1b[1m',
  /** Magenta text (special) */
  magenta: '\x1b[35m',
  /** Blue text */
  blue: '\x1b[34m',
  /** White text */
  white: '\x1b[37m',
  /** Gray text (muted) */
  gray: '\x1b[90m',
} as const;

/** Type for supported color names. */
export type ColorName = keyof typeof RAW_ANSI;

// ============================================================================
// Color Detection & Factory
// ============================================================================

function isStdoutTTY(): boolean {
  return typeof process.stdout.isTTY === 'boolean' ? process.stdout.isTTY : false;
}

/**
 * Detect whether terminal color output is enabled according to the
 * NO_COLOR standard (https://no-color.org/) and TTY presence.
 *
 * @param env - Environment variable map (defaults to process.env)
 * @param isTTY - Whether stdout is a TTY (defaults to isStdoutTTY())
 * @returns boolean indicating if color formatting should be active
 */
export function detectColorsEnabled(
  env: NodeJS.ProcessEnv = process.env,
  isTTY: boolean = isStdoutTTY()
): boolean {
  if ('NO_COLOR' in env) {
    return false;
  }
  return isTTY;
}

/**
 * Whether color output is enabled by default in the current process environment.
 */
export const colorsEnabled = detectColorsEnabled();

const EMPTY_COLORS: Record<ColorName, string> = {
  reset: '',
  green: '',
  yellow: '',
  red: '',
  cyan: '',
  dim: '',
  bold: '',
  magenta: '',
  blue: '',
  white: '',
  gray: '',
};

/**
 * Creates an ANSI color map.
 * When enabled is true, returns active ANSI escape sequences;
 * when enabled is false, returns empty strings for all colors.
 *
 * @param enabled - Whether color codes should be active
 * @returns Object mapping ColorName to escape sequence or empty string
 */
export function createColors(enabled: boolean = colorsEnabled): Record<ColorName, string> {
  return enabled ? RAW_ANSI : EMPTY_COLORS;
}

/**
 * Pre-configured ANSI color map initialized with process-level detection.
 */
export const colors = createColors(colorsEnabled);
