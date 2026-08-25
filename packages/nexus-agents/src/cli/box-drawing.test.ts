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
import { visibleWidth } from './ansi-width.js';

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

// =============================================================================
// Padding measures display columns, not bytes (#4913)
// =============================================================================

describe('visibleWidth and ANSI-aware padding (#4913)', () => {
  // `colors.*` are empty strings under NO_COLOR / non-TTY, which is how the
  // suite runs — so a rendered-width test cannot tell ANSI-aware padding from
  // raw `.length`. These inject the escapes literally.
  const BOLD = '\u001b[1m';
  const RESET = '\u001b[0m';

  it('ignores ANSI escapes when measuring', () => {
    expect(visibleWidth(`${BOLD}abc${RESET}`)).toBe(3);
  });

  it('measures a plain string as its length', () => {
    // The pair: stripping too eagerly would under-count ordinary text.
    expect(visibleWidth('abc')).toBe(3);
  });

  it('pads a coloured line to the same display width as a plain one', () => {
    // The defect: `.length` counted the escape bytes, so a coloured line got
    // fewer pad spaces and its right border landed short. Three call sites had
    // grown hand-tuned `BOX_WIDTH + n` constants compensating for exactly this.
    const plain = boxLine('abc');
    const coloured = boxLine(`${BOLD}abc${RESET}`);

    expect(visibleWidth(coloured)).toBe(visibleWidth(plain));
  });

  it('centers coloured text on its display width too', () => {
    // `centerText` had the identical defect: `BOX_WIDTH - text.length - 2`
    // counted escape bytes, so coloured text drifted left by half the escape
    // length. Same fix, and it needs its own assertion — the boxLine tests
    // above pass with centerText still broken.
    const plain = centerText('abc');
    const coloured = centerText(`${BOLD}abc${RESET}`);

    expect(visibleWidth(coloured)).toBe(visibleWidth(plain));
  });

  it('does not pad content wider than the box', () => {
    // A box cannot contain it, and truncating would hide data. The caller
    // splits — `formatTaskAnalysis` does — and the overflow stays visible.
    const long = 'x'.repeat(BOX_WIDTH * 2);

    expect(boxLine(long)).toContain(long);
  });
});
