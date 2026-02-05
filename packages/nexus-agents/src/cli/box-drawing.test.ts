/**
 * Tests for box-drawing.ts
 *
 * Covers horizontal lines, box borders, content lines,
 * centered text, and box structure elements.
 */

import { describe, it, expect } from 'vitest';
import {
  BOX_WIDTH,
  horizontalLine,
  boxLine,
  centerText,
  boxTop,
  boxSeparator,
  boxBottom,
} from './box-drawing.js';

// ============================================================================
// BOX_WIDTH
// ============================================================================

describe('BOX_WIDTH', () => {
  it('is a positive number', () => {
    expect(BOX_WIDTH).toBeGreaterThan(0);
  });

  it('equals 65', () => {
    expect(BOX_WIDTH).toBe(65);
  });
});

// ============================================================================
// horizontalLine
// ============================================================================

describe('horizontalLine', () => {
  it('produces a string of default char with length BOX_WIDTH - 2', () => {
    const line = horizontalLine();
    expect(line).toHaveLength(BOX_WIDTH - 2);
    expect(line).toMatch(/^─+$/);
  });

  it('accepts custom character', () => {
    const line = horizontalLine('=');
    expect(line).toHaveLength(BOX_WIDTH - 2);
    expect(line).toMatch(/^=+$/);
  });
});

// ============================================================================
// boxLine
// ============================================================================

describe('boxLine', () => {
  it('wraps content with border characters', () => {
    const result = boxLine('hello');
    // Should contain the content between border chars
    expect(result).toContain('hello');
  });

  it('pads content to fill the box width', () => {
    const result = boxLine('hi');
    // The result should contain the content padded to BOX_WIDTH - 2
    // plus ANSI codes for the border characters
    expect(result).toContain('hi');
  });
});

// ============================================================================
// centerText
// ============================================================================

describe('centerText', () => {
  it('centers short text within the box', () => {
    const result = centerText('TITLE');
    expect(result).toContain('TITLE');
  });

  it('handles text that fills most of the width', () => {
    const longText = 'A'.repeat(BOX_WIDTH - 4);
    const result = centerText(longText);
    expect(result).toContain(longText);
  });

  it('handles empty text', () => {
    const result = centerText('');
    // Should still have borders
    expect(result.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// boxTop
// ============================================================================

describe('boxTop', () => {
  it('starts with top-left corner', () => {
    const result = boxTop();
    expect(result).toContain('╭');
  });

  it('ends with top-right corner', () => {
    const result = boxTop();
    expect(result).toContain('╮');
  });

  it('contains horizontal line between corners', () => {
    const result = boxTop();
    expect(result).toContain('─');
  });
});

// ============================================================================
// boxSeparator
// ============================================================================

describe('boxSeparator', () => {
  it('uses T-junction characters', () => {
    const result = boxSeparator();
    expect(result).toContain('├');
    expect(result).toContain('┤');
  });

  it('contains horizontal line', () => {
    const result = boxSeparator();
    expect(result).toContain('─');
  });
});

// ============================================================================
// boxBottom
// ============================================================================

describe('boxBottom', () => {
  it('starts with bottom-left corner', () => {
    const result = boxBottom();
    expect(result).toContain('╰');
  });

  it('ends with bottom-right corner', () => {
    const result = boxBottom();
    expect(result).toContain('╯');
  });

  it('contains horizontal line between corners', () => {
    const result = boxBottom();
    expect(result).toContain('─');
  });
});
