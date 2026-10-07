import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  GRADE_DIFF_TEXT,
  GRADE_DIFF_UI,
  gradeDifference,
  luminanceGrade,
  oklchLuminance,
  parsePalette,
  type Oklch,
  type Palette,
} from './palette-grade.ts';

const require = createRequire(import.meta.url);
const remarqueCss = readFileSync(require.resolve('remarque-tokens/tokens-palette.css'), 'utf8');
const siteCss = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');

/** The effective palette: remarque's defaults, then this site's overrides. */
const palette: Palette = new Map([...parsePalette(remarqueCss), ...parsePalette(siteCss)]);

/**
 * remarque declares --color-link as an alias (`var(--color-accent)`), which
 * parsePalette does not read. Resolve it here so link pairs are measured;
 * if the alias changes shape, `pair()` finds no value and the test fails.
 */
const LINK_TARGET = /--color-link:\s*var\((--color-[a-z-]+)\)/.exec(remarqueCss)?.[1];
const linkValue = LINK_TARGET === undefined ? undefined : palette.get(LINK_TARGET);
if (linkValue !== undefined) palette.set('--color-link', linkValue);

describe('oklchLuminance / luminanceGrade', () => {
  it('maps white to grade 0 and black to grade 100', () => {
    expect(oklchLuminance([1, 0, 0])).toBeCloseTo(1, 3);
    expect(oklchLuminance([0, 0, 0])).toBeCloseTo(0, 6);
    expect(luminanceGrade(1)).toBe(0);
    expect(luminanceGrade(0)).toBe(100);
  });

  it('puts the USWDS grade-50 band midpoint at grade 50', () => {
    expect(luminanceGrade(0.179)).toBeCloseTo(50, 5);
  });

  it('agrees with the WCAG ratios remarque documents for its own palette', () => {
    // remarque tokens-palette.css: fg-muted on bg is 7.55:1 in light.
    const fg = oklchLuminance([0.43, 0.015, 80]);
    const bg = oklchLuminance([0.975, 0.005, 80]);
    expect((bg + 0.05) / (fg + 0.05)).toBeCloseTo(7.55, 1);
  });
});

describe('parsePalette', () => {
  it('reads light-dark() pairs from top-level :root blocks only', () => {
    const css = `
      :root { --color-a: light-dark(oklch(0.5 0.1 250), oklch(0.6 0.1 250)); }
      @media (prefers-contrast: more) { :root { --color-a: light-dark(oklch(0.1 0 0), oklch(0.9 0 0)); } }
      .x { --color-b: light-dark(oklch(0.2 0 0), oklch(0.3 0 0)); }`;
    expect([...parsePalette(css)]).toEqual([
      ['--color-a', { light: [0.5, 0.1, 250], dark: [0.6, 0.1, 250] }],
    ]);
  });

  it('accepts percentage lightness and returns nothing for no declarations', () => {
    expect(
      parsePalette(':root{--color-a: light-dark(oklch(50% .1 250), oklch(60% .1 250))}').get(
        '--color-a'
      )
    ).toEqual({
      light: [0.5, 0.1, 250],
      dark: [0.6, 0.1, 250],
    });
    expect(parsePalette('').size).toBe(0);
  });

  it('resolved the --color-link alias to a palette slot', () => {
    expect(LINK_TARGET).toBe('--color-accent');
    expect(palette.get('--color-link')).toBeDefined();
  });

  it('found the remarque palette (a vacuous parse would pass every pair)', () => {
    expect(palette.size).toBeGreaterThanOrEqual(20);
  });
});

/**
 * USWDS's contrast contract, expressed over this site's OKLCH palette: a text
 * pair must sit at least 50 grades apart, a UI boundary at least 40
 * (designsystem.digital.gov "magic number"). Grades come from WCAG relative
 * luminance, so a pair that clears 4.5:1 can still sit at 49.9 grades.
 */
const TEXT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['--color-fg', '--color-bg'],
  ['--color-fg', '--color-surface'],
  ['--color-fg', '--color-bg-subtle'],
  ['--color-fg-muted', '--color-bg'],
  ['--color-fg-muted', '--color-surface'],
  ['--color-fg-muted', '--color-bg-subtle'],
  ['--color-muted', '--color-bg'],
  ['--color-muted', '--color-surface'],
  ['--color-muted', '--color-bg-subtle'],
  ['--color-accent', '--color-bg'],
  ['--color-accent', '--color-bg-subtle'],
  ['--color-accent', '--color-accent-subtle'],
  ['--color-accent-hover', '--color-bg'],
  ['--color-code-fg', '--color-code-bg'],
  ['--color-error', '--color-bg'],
  ['--color-success', '--color-bg'],
  ['--color-warning', '--color-bg'],
  // Links inside callouts sit on the callout's tinted background.
  ['--color-link', '--color-accent-subtle'],
  ['--color-link', '--color-success-subtle'],
  ['--color-link', '--color-warning-subtle'],
  ['--color-link', '--color-error-subtle'],
  ...[
    'keyword',
    'string',
    'constant',
    'comment',
    'function',
    'type',
    'punctuation',
    'variable',
  ].map((slot) => [`--color-syntax-${slot}`, '--color-code-bg'] as const),
];

const UI_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['--color-border-bold', '--color-bg'],
  ['--color-border-bold', '--color-surface'],
  ['--color-border-bold', '--color-bg-subtle'],
  ['--color-accent', '--color-bg'],
];

function pair(fg: string, bg: string, theme: 'light' | 'dark'): [Oklch, Oklch] {
  const a = palette.get(fg)?.[theme];
  const b = palette.get(bg)?.[theme];
  if (a === undefined || b === undefined)
    throw new Error(`palette has no ${theme} value for ${fg} or ${bg}`);
  return [a, b];
}

describe.each(['light', 'dark'] as const)('palette grade contract (%s theme)', (theme) => {
  it.each(TEXT_PAIRS)(
    `text: %s on %s differs by at least ${String(GRADE_DIFF_TEXT)} grades`,
    (fg, bg) => {
      expect(gradeDifference(...pair(fg, bg, theme))).toBeGreaterThanOrEqual(GRADE_DIFF_TEXT);
    }
  );

  it.each(UI_PAIRS)(
    `UI: %s on %s differs by at least ${String(GRADE_DIFF_UI)} grades`,
    (fg, bg) => {
      expect(gradeDifference(...pair(fg, bg, theme))).toBeGreaterThanOrEqual(GRADE_DIFF_UI);
    }
  );
});
