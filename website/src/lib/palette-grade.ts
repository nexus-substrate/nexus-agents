/**
 * palette-grade.ts — USWDS's contrast-grade contract over an OKLCH palette (#7285).
 *
 * USWDS gives every colour a grade from 0 (white) to 100 (black), banded by
 * WCAG relative luminance, and guarantees contrast by grade difference: 50+
 * for text (WCAG AA 4.5:1), 40+ for UI boundaries (3:1). The "magic numbers"
 * are designsystem.digital.gov/design-tokens/color/overview (CC0). Here the
 * grade is computed from luminance, interpolating between band midpoints, so
 * any OKLCH value gets one — remarque's palette is not authored in grades.
 *
 * Pure functions; the test reads the real CSS and asserts the pairs.
 *
 * @module website/src/lib/palette-grade
 */

/** OKLCH as [L 0–1, C, h degrees]. */
export type Oklch = readonly [number, number, number];

export interface ThemePair {
  light: Oklch;
  dark: Oklch;
}

export type Palette = Map<string, ThemePair>;

export const GRADE_DIFF_TEXT = 50;
export const GRADE_DIFF_UI = 40;

/** OKLCH → WCAG relative luminance, via linear sRGB (Ottosson's matrices), gamut-clipped. */
export function oklchLuminance([lightness, chroma, hue]: Oklch): number {
  const rad = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(rad);
  const b = chroma * Math.sin(rad);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (v: number): number => Math.min(1, Math.max(0, v));
  const r = clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

/**
 * USWDS grade bands as [grade, luminance at the band's midpoint]. Grade 0
 * is white and 100 black; the rest are the midpoints of USWDS's published
 * luminance ranges (e.g. grade 50 = 0.175–0.183).
 */
const BANDS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [5, 0.89],
  [10, 0.785],
  [20, 0.575],
  [30, 0.4],
  [40, 0.275],
  [50, 0.179],
  [60, 0.1125],
  [70, 0.06],
  [80, 0.03],
  [90, 0.01],
  [100, 0],
];

/** Luminance → grade, linear between band midpoints. */
export function luminanceGrade(luminance: number): number {
  const y = Math.min(1, Math.max(0, luminance));
  for (let i = 0; i < BANDS.length - 1; i++) {
    const [g0, y0] = BANDS[i] ?? [0, 1];
    const [g1, y1] = BANDS[i + 1] ?? [100, 0];
    if (y <= y0 && y >= y1) return g0 + ((g1 - g0) * (y0 - y)) / (y0 - y1);
  }
  throw new Error(`luminance ${String(luminance)} fell outside every grade band`);
}

export function gradeDifference(a: Oklch, b: Oklch): number {
  return Math.abs(luminanceGrade(oklchLuminance(a)) - luminanceGrade(oklchLuminance(b)));
}

const OKLCH = /^oklch\(\s*(-?[\d.]+%?)\s+(-?[\d.]+%?)\s+(-?[\d.]+%?)\s*\)$/;
const VAR = /^var\(\s*(--color-[\w-]+)\s*\)$/;
const LIGHT_DARK = /^light-dark\((.*)\)$/;

function num(raw: string): number {
  return raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
}

/** The bodies of `:root { … }` rules at the top level (not inside @media or other rules). */
function topLevelRootBodies(css: string): string[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const bodies: string[] = [];
  let depth = 0;
  let selectorStart = 0;
  let bodyStart = -1;
  let isRoot = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      if (depth === 0) {
        isRoot = src.slice(selectorStart, i).trim() === ':root';
        bodyStart = i + 1;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        if (isRoot) bodies.push(src.slice(bodyStart, i));
        selectorStart = i + 1;
      }
    } else if (ch === ';' && depth === 0) {
      selectorStart = i + 1;
    }
  }
  return bodies;
}

/** Split `a, b` at the top-level comma (not one inside oklch(…)). */
function splitArgs(args: string): [string, string] | undefined {
  let depth = 0;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) return [args.slice(0, i).trim(), args.slice(i + 1).trim()];
  }
  return undefined;
}

function side(raw: string, palette: Palette, theme: 'light' | 'dark'): Oklch | undefined {
  const lch = OKLCH.exec(raw);
  if (lch !== null) return [num(lch[1]), num(lch[2]), num(lch[3])];
  const alias = VAR.exec(raw)?.[1];
  return alias === undefined ? undefined : palette.get(alias)?.[theme];
}

/**
 * `--color-*: light-dark(<a>, <b>)` declarations from top-level `:root`
 * rules, later declarations winning. Each side is an `oklch()` value or a
 * `var()` alias to a colour declared earlier. Anything else is not read as a
 * palette entry.
 */
export function parsePalette(css: string): Palette {
  const palette: Palette = new Map();
  for (const body of topLevelRootBodies(css)) {
    for (const decl of body.split(';')) {
      const colon = decl.indexOf(':');
      if (colon === -1) continue;
      const name = decl.slice(0, colon).trim();
      if (!name.startsWith('--color-')) continue;
      const args = LIGHT_DARK.exec(decl.slice(colon + 1).trim())?.[1];
      const pair = args === undefined ? undefined : splitArgs(args);
      if (pair === undefined) continue;
      const light = side(pair[0], palette, 'light');
      const dark = side(pair[1], palette, 'dark');
      if (light !== undefined && dark !== undefined) palette.set(name, { light, dark });
    }
  }
  return palette;
}
