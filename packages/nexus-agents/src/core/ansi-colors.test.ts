/**
 * Tests for core/ansi-colors.ts
 *
 * Covers ANSI color definitions, TTY/NO_COLOR detection, createColors factory,
 * and RAW_ANSI constant codes.
 */

import { describe, it, expect } from 'vitest';
import {
  colors,
  colorsEnabled,
  createColors,
  detectColorsEnabled,
  RAW_ANSI,
  type ColorName,
} from './ansi-colors.js';

describe('RAW_ANSI', () => {
  it('contains expected ANSI escape codes', () => {
    expect(RAW_ANSI.reset).toBe('\x1b[0m');
    expect(RAW_ANSI.green).toBe('\x1b[32m');
    expect(RAW_ANSI.yellow).toBe('\x1b[33m');
    expect(RAW_ANSI.red).toBe('\x1b[31m');
    expect(RAW_ANSI.cyan).toBe('\x1b[36m');
    expect(RAW_ANSI.dim).toBe('\x1b[2m');
    expect(RAW_ANSI.bold).toBe('\x1b[1m');
    expect(RAW_ANSI.magenta).toBe('\x1b[35m');
    expect(RAW_ANSI.blue).toBe('\x1b[34m');
    expect(RAW_ANSI.white).toBe('\x1b[37m');
    expect(RAW_ANSI.gray).toBe('\x1b[90m');
  });
});

describe('createColors', () => {
  it('returns active escape codes when enabled is true', () => {
    const enabledColors = createColors(true);
    expect(enabledColors.reset).toBe('\x1b[0m');
    expect(enabledColors.green).toBe('\x1b[32m');
    expect(enabledColors.yellow).toBe('\x1b[33m');
    expect(enabledColors.red).toBe('\x1b[31m');
    expect(enabledColors.cyan).toBe('\x1b[36m');
    expect(enabledColors.dim).toBe('\x1b[2m');
    expect(enabledColors.bold).toBe('\x1b[1m');
  });

  it('returns empty strings for all colors when enabled is false', () => {
    const disabledColors = createColors(false);
    expect(disabledColors.reset).toBe('');
    expect(disabledColors.green).toBe('');
    expect(disabledColors.yellow).toBe('');
    expect(disabledColors.red).toBe('');
    expect(disabledColors.cyan).toBe('');
    expect(disabledColors.dim).toBe('');
    expect(disabledColors.bold).toBe('');
    expect(disabledColors.magenta).toBe('');
    expect(disabledColors.blue).toBe('');
    expect(disabledColors.white).toBe('');
    expect(disabledColors.gray).toBe('');
  });
});

describe('detectColorsEnabled', () => {
  it('returns false when NO_COLOR is set regardless of TTY', () => {
    expect(detectColorsEnabled({ NO_COLOR: '1' }, true)).toBe(false);
    expect(detectColorsEnabled({ NO_COLOR: '' }, true)).toBe(false);
  });

  it('returns false when stdout is not a TTY', () => {
    expect(detectColorsEnabled({}, false)).toBe(false);
  });

  it('returns true when NO_COLOR is unset and stdout is a TTY', () => {
    expect(detectColorsEnabled({}, true)).toBe(true);
  });
});

describe('colors constant and ColorName type', () => {
  it('exports colors initialized with colorsEnabled', () => {
    expect(colors.reset).toBe(colorsEnabled ? '\x1b[0m' : '');
    const validKey: ColorName = 'green';
    expect(colors[validKey]).toBeDefined();
  });
});
