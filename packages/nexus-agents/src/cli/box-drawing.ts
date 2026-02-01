/**
 * Box Drawing Utilities
 *
 * Shared ASCII box drawing helpers for CLI dashboard rendering.
 * Used by learning-metrics-format.ts, routing-audit-format.ts, etc.
 *
 * @module cli/box-drawing
 */

import { colors, color } from './ansi-output.js';

// =============================================================================
// Constants
// =============================================================================

/** Standard box width for CLI dashboards. */
export const BOX_WIDTH = 65;

// =============================================================================
// Box Drawing Functions
// =============================================================================

/**
 * Creates a horizontal line of repeating characters.
 * @param char Character to repeat (default: ─)
 */
export function horizontalLine(char = '─'): string {
  return char.repeat(BOX_WIDTH - 2);
}

/**
 * Creates a box line with content and borders.
 * Content is padded to BOX_WIDTH and bordered with │ characters.
 * @param content Content to display inside the box
 * @param borderColor ANSI color code for the border (default: cyan)
 */
export function boxLine(content: string, borderColor = colors.cyan): string {
  return color('│', borderColor) + content.padEnd(BOX_WIDTH - 2) + color('│', borderColor);
}

/**
 * Creates a centered text line inside a box.
 * @param text Text to center
 * @param borderColor ANSI color code for the border (default: cyan)
 */
export function centerText(text: string, borderColor = colors.cyan): string {
  const padding = Math.max(0, BOX_WIDTH - text.length - 2);
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return (
    color('│', borderColor) + ' '.repeat(left) + text + ' '.repeat(right) + color('│', borderColor)
  );
}

/**
 * Creates a box top border.
 * @param borderColor ANSI color code for the border (default: cyan)
 */
export function boxTop(borderColor = colors.cyan): string {
  return color('╭' + horizontalLine() + '╮', borderColor);
}

/**
 * Creates a box separator line.
 * @param borderColor ANSI color code for the border (default: cyan)
 */
export function boxSeparator(borderColor = colors.cyan): string {
  return color('├' + horizontalLine() + '┤', borderColor);
}

/**
 * Creates a box bottom border.
 * @param borderColor ANSI color code for the border (default: cyan)
 */
export function boxBottom(borderColor = colors.cyan): string {
  return color('╰' + horizontalLine() + '╯', borderColor);
}
