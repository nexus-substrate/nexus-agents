/**
 * ANSI Output Utilities
 *
 * Consolidated terminal output utilities for CLI commands.
 * Provides colors, symbols, and output helpers with cross-platform support.
 *
 * @module cli/ansi-output
 */

// ============================================================================
// ANSI Color Codes
// ============================================================================

/**
 * ANSI color codes for terminal output.
 * Use these for consistent styling across all CLI commands.
 */
export const colors = {
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

/** Type for color names. */
export type ColorName = keyof typeof colors;

// ============================================================================
// Cross-Platform Symbols
// ============================================================================

const isWindows = process.platform === 'win32';

/**
 * Cross-platform console symbols.
 * Provides Unicode symbols on Unix, ASCII fallbacks on Windows.
 */
export const symbols = {
  /** Success indicator */
  check: isWindows ? '[OK]' : '✓',
  /** Failure indicator */
  cross: isWindows ? '[X]' : '✗',
  /** Warning indicator */
  warn: isWindows ? '[!]' : '⚠',
  /** Bullet point */
  bullet: isWindows ? '*' : '•',
  /** Arrow right */
  arrow: isWindows ? '->' : '→',
  /** Information */
  info: isWindows ? '[i]' : 'ℹ',
  /** Circle/empty indicator */
  circle: isWindows ? 'o' : '○',
} as const;

/** Type for symbol names. */
export type SymbolName = keyof typeof symbols;

// ============================================================================
// Output Functions
// ============================================================================

/**
 * Writes a line to stdout with newline.
 * If no text is provided, writes an empty line.
 */
export function writeLine(text: string = ''): void {
  process.stdout.write(text + '\n');
}

/**
 * Writes an empty line to stdout.
 * Prefer writeLine() without arguments for consistency.
 */
export function writeEmptyLine(): void {
  process.stdout.write('\n');
}

/**
 * Writes text to stdout without newline.
 */
export function write(text: string): void {
  process.stdout.write(text);
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Wraps text in a color code with reset.
 */
export function colorize(text: string, color: ColorName): string {
  return `${colors[color]}${text}${colors.reset}`;
}

/**
 * Wraps text in a raw ANSI code with reset.
 * Use this when combining codes or using dynamic values.
 */
export function color(text: string, code: string): string {
  return `${code}${text}${colors.reset}`;
}

/**
 * Formats text as bold.
 */
export function bold(text: string): string {
  return `${colors.bold}${text}${colors.reset}`;
}

/**
 * Formats text as dim.
 */
export function dim(text: string): string {
  return `${colors.dim}${text}${colors.reset}`;
}

/**
 * Status types for formatStatus.
 * Basic: 'pass', 'warn', 'fail' (3-state)
 * Extended: adds 'success', 'failed', 'skipped', 'pending', 'warning' (setup command compatibility)
 */
export type StatusType =
  | 'pass'
  | 'warn'
  | 'fail'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'pending'
  | 'warning';

/**
 * Formats a status indicator with appropriate color and symbol.
 *
 * Supports both basic 3-state (pass/warn/fail) and extended 5-state
 * (success/failed/skipped/pending/warning) status indicators.
 */
export function formatStatus(status: StatusType): string {
  const statusMap: Record<StatusType, string> = {
    // Basic 3-state (system review, fitness audit)
    pass: colors.green + symbols.check,
    warn: colors.yellow + symbols.warn,
    fail: colors.red + symbols.cross,
    // Extended state aliases (setup command)
    success: colors.green + symbols.check,
    failed: colors.red + symbols.cross,
    skipped: colors.yellow + symbols.warn,
    pending: colors.dim + symbols.circle,
    warning: colors.yellow + symbols.warn,
  };
  return statusMap[status] + colors.reset;
}

/**
 * Formats a section header with bold styling.
 */
export function formatHeader(text: string): string {
  return `${colors.bold}${text}${colors.reset}`;
}

/**
 * Formats a code block with indentation and dim styling.
 */
export function formatCodeBlock(code: string): string {
  const lines = code.split('\n');
  return lines.map((line) => `  ${colors.dim}${line}${colors.reset}`).join('\n');
}

/**
 * Formats a boolean value with color.
 */
export function formatBoolean(value: boolean): string {
  return value ? `${colors.green}true${colors.reset}` : `${colors.red}false${colors.reset}`;
}
