import { describe, expect, it } from 'vitest';
import { effectiveDark, storedTheme, toggledTheme } from './theme.ts';

describe('effectiveDark', () => {
  it('follows the OS while nothing is chosen', () => {
    expect(effectiveDark(undefined, true)).toBe(true);
    expect(effectiveDark(undefined, false)).toBe(false);
  });

  it('lets a chosen theme win over the OS', () => {
    expect(effectiveDark('light', true)).toBe(false);
    expect(effectiveDark('dark', false)).toBe(true);
  });

  it('treats an unknown [data-theme] value as no choice', () => {
    expect(effectiveDark('sepia', true)).toBe(true);
    expect(effectiveDark('', false)).toBe(false);
  });
});

describe('toggledTheme', () => {
  it('flips the effective theme, not the stored one', () => {
    // Nothing chosen, OS dark: the page is dark, so the toggle goes light.
    expect(toggledTheme(undefined, true)).toBe('light');
    expect(toggledTheme(undefined, false)).toBe('dark');
    expect(toggledTheme('dark', false)).toBe('light');
    expect(toggledTheme('light', true)).toBe('dark');
  });
});

describe('storedTheme', () => {
  it('accepts only light and dark', () => {
    expect(storedTheme('light')).toBe('light');
    expect(storedTheme('dark')).toBe('dark');
  });

  it('is undefined for a missing or unknown value', () => {
    expect(storedTheme(null)).toBeUndefined();
    expect(storedTheme('')).toBeUndefined();
    expect(storedTheme('Dark')).toBeUndefined();
  });
});
