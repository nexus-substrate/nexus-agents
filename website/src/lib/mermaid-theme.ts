/**
 * mermaid-theme.ts — Dynamic Mermaid theme configuration reading Remarque CSS tokens (#7231).
 *
 * Translates Remarque CSS custom properties (--color-fg, --color-bg, etc.) into
 * Mermaid base themeVariables dynamically, ensuring diagrams track the ink-on-paper
 * design system in both light and dark modes.
 *
 * @module website/src/lib/mermaid-theme
 */

import type { MermaidConfig } from 'mermaid';

export interface RemarqueTokens {
  fg: string;
  bg: string;
  surface: string;
  borderBold: string;
  error: string;
  errorSubtle: string;
  fgMuted: string;
  muted: string;
  accent: string;
}

export type MermaidThemeVariables = Record<string, string>;

/**
 * Parses an OKLCH color string: `oklch(L C H)` or `oklch(L C H / alpha)`.
 * Converts to RGB channels via Ottosson's matrices.
 */
export function parseOklch(
  raw: string
): { r: number; g: number; b: number; a?: number } | null {
  const match = raw.match(
    /^oklch\(\s*(-?[\d.]+%?)\s+(-?[\d.]+%?)\s+(-?[\d.]+)(?:\s*\/\s*(-?[\d.]+%?))?\s*\)$/
  );
  if (!match) return null;

  const parseNum = (v: string): number =>
    v.endsWith('%') ? Number(v.slice(0, -1)) / 100 : Number(v);

  const L = parseNum(match[1] ?? '0');
  const C = parseNum(match[2] ?? '0');
  const H = Number(match[3] ?? '0');
  const alphaStr = match[4];
  const alpha = alphaStr !== undefined ? parseNum(alphaStr) : undefined;

  const rad = (H * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const rLin = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const toSrgb = (x: number): number => {
    const c = Math.min(1, Math.max(0, x));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  };

  const red = Math.round(toSrgb(rLin) * 255);
  const green = Math.round(toSrgb(gLin) * 255);
  const blue = Math.round(toSrgb(bLin) * 255);

  return alpha !== undefined
    ? { r: red, g: green, b: blue, a: alpha }
    : { r: red, g: green, b: blue };
}

/**
 * Converts OKLCH string to `rgb(r, g, b)` or `rgba(r, g, b, a)`.
 * Passes through already formatted rgb, rgba, or named colors.
 */
export function oklchToRgb(colorStr: string): string {
  const trimmed = colorStr.trim();
  if (!trimmed.startsWith('oklch')) return trimmed;
  const parsed = parseOklch(trimmed);
  if (!parsed) return trimmed;
  if (parsed.a !== undefined && parsed.a < 1) {
    return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${parsed.a})`;
  }
  return `rgb(${parsed.r}, ${parsed.g}, ${parsed.b})`;
}

/**
 * Resolves a CSS color to a format parsed by Mermaid's khroma library (rgb/rgba).
 */
export function resolveCssColor(
  colorVal: string,
  canvasCtx?: CanvasRenderingContext2D | null
): string {
  const trimmed = colorVal.trim();
  if (trimmed.startsWith('rgb(') || trimmed.startsWith('rgba(') || trimmed === 'transparent') {
    return trimmed;
  }

  // Try Canvas 2D first when available
  if (canvasCtx) {
    try {
      canvasCtx.clearRect(0, 0, 1, 1);
      canvasCtx.fillStyle = trimmed;
      canvasCtx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = canvasCtx.getImageData(0, 0, 1, 1).data;
      if (a !== undefined && (r !== 0 || g !== 0 || b !== 0 || a !== 0)) {
        return a === 255
          ? `rgb(${r}, ${g}, ${b})`
          : `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`;
      }
    } catch {
      // Fall through to pure OKLCH parser
    }
  }

  return oklchToRgb(trimmed);
}

/**
 * Fallback values matching Remarque palette tokens when running outside browser DOM.
 */
const FALLBACK_LIGHT_TOKENS: RemarqueTokens = {
  fg: 'rgb(20, 17, 13)',
  bg: 'rgb(248, 246, 243)',
  surface: 'rgb(245, 243, 240)',
  borderBold: 'rgb(137, 134, 128)',
  error: 'rgb(163, 73, 69)',
  errorSubtle: 'rgb(243, 237, 236)',
  fgMuted: 'rgb(114, 110, 104)',
  muted: 'rgb(114, 110, 104)',
  accent: 'rgb(3, 101, 175)',
};

const FALLBACK_DARK_TOKENS: RemarqueTokens = {
  fg: 'rgb(224, 222, 218)',
  bg: 'rgb(16, 13, 9)',
  surface: 'rgb(22, 19, 15)',
  borderBold: 'rgb(102, 99, 93)',
  error: 'rgb(192, 106, 99)',
  errorSubtle: 'rgb(35, 23, 23)',
  fgMuted: 'rgb(131, 128, 122)',
  muted: 'rgb(131, 128, 122)',
  accent: 'rgb(91, 157, 223)',
};

/**
 * Reads Remarque CSS custom properties from the DOM root element.
 */
export function readRemarqueTokens(
  root?: Element | null,
  isDark?: boolean
): RemarqueTokens {
  if (typeof document === 'undefined') {
    return isDark ? FALLBACK_DARK_TOKENS : FALLBACK_LIGHT_TOKENS;
  }

  const targetEl = root ?? document.documentElement;
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  targetEl.appendChild(probe);

  let canvasCtx: CanvasRenderingContext2D | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    canvasCtx = canvas.getContext('2d');
  } catch {
    canvasCtx = null;
  }

  const resolveVar = (cssVar: string, fallback: string): string => {
    probe.style.color = `var(${cssVar})`;
    const computed = getComputedStyle(probe).color;
    if (!computed || computed === '') return fallback;
    const resolved = resolveCssColor(computed, canvasCtx);
    return resolved && resolved !== '' ? resolved : fallback;
  };

  const fallbacks = isDark ? FALLBACK_DARK_TOKENS : FALLBACK_LIGHT_TOKENS;
  const tokens: RemarqueTokens = {
    fg: resolveVar('--color-fg', fallbacks.fg),
    bg: resolveVar('--color-bg', fallbacks.bg),
    surface: resolveVar('--color-surface', fallbacks.surface),
    borderBold: resolveVar('--color-border-bold', fallbacks.borderBold),
    error: resolveVar('--color-error', fallbacks.error),
    errorSubtle: resolveVar('--color-error-subtle', fallbacks.errorSubtle),
    fgMuted: resolveVar('--color-fg-muted', fallbacks.fgMuted),
    muted: resolveVar('--color-muted', fallbacks.muted),
    accent: resolveVar('--color-accent', fallbacks.accent),
  };

  probe.remove();
  return tokens;
}

/**
 * Converts Remarque tokens into Mermaid theme variables.
 */
export function tokensToMermaidVariables(
  tokens: RemarqueTokens,
  isDark: boolean
): MermaidThemeVariables {
  return {
    primaryColor: tokens.fg,
    primaryTextColor: tokens.bg,
    primaryBorderColor: tokens.fg,
    secondaryColor: tokens.surface,
    secondaryTextColor: tokens.fg,
    tertiaryColor: isDark ? tokens.surface : tokens.bg,
    tertiaryTextColor: tokens.fg,
    lineColor: isDark ? tokens.fgMuted : tokens.borderBold,
    textColor: tokens.fg,
    mainBkg: tokens.fg,
    secondBkg: tokens.surface,
    background: 'transparent',
    nodeBorder: tokens.fg,
    clusterBkg: tokens.errorSubtle,
    clusterBorder: tokens.error,
    defaultLinkColor: tokens.muted,
    // Flowchart edge labels in dark mode need light background for dark text readability
    edgeLabelBackground: isDark ? tokens.fg : tokens.bg,
    fontSize: '14px',
  };
}

/**
 * Builds the MermaidConfig object configured with the Remarque design system.
 */
export function buildMermaidTheme(
  root?: Element | null,
  isDark?: boolean
): MermaidConfig {
  const darkActive =
    isDark ??
    (typeof document !== 'undefined'
      ? document.documentElement.dataset.theme === 'dark' ||
        (document.documentElement.dataset.theme !== 'light' &&
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches)
      : false);

  const tokens = readRemarqueTokens(root, darkActive);
  const themeVariables = tokensToMermaidVariables(tokens, darkActive);

  return {
    startOnLoad: false,
    theme: 'base',
    securityLevel: 'strict',
    fontFamily: "'Source Sans 3', system-ui, sans-serif",
    themeVariables,
    flowchart: { curve: 'linear', padding: 16, useMaxWidth: true, htmlLabels: true },
  };
}
