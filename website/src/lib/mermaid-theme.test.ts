import { describe, expect, it } from 'vitest';
import {
  buildMermaidTheme,
  oklchToRgb,
  parseOklch,
  readRemarqueTokens,
  resolveCssColor,
  tokensToMermaidVariables,
  type RemarqueTokens,
} from './mermaid-theme.ts';

describe('parseOklch and oklchToRgb', () => {
  it('parses standard oklch color string and converts to rgb', () => {
    const parsed = parseOklch('oklch(0.18 0.01 80)');
    expect(parsed).not.toBeNull();
    expect(parsed?.r).toBe(20);
    expect(parsed?.g).toBe(17);
    expect(parsed?.b).toBe(13);

    const rgb = oklchToRgb('oklch(0.18 0.01 80)');
    expect(rgb).toBe('rgb(20, 17, 13)');
  });

  it('converts dark background oklch correctly', () => {
    const rgb = oklchToRgb('oklch(0.16 0.01 80)');
    expect(rgb).toBe('rgb(16, 13, 9)');
  });

  it('handles percentages in lightness channel', () => {
    const rgb = oklchToRgb('oklch(18% 0.01 80)');
    expect(rgb).toBe('rgb(20, 17, 13)');
  });

  it('handles alpha channel', () => {
    const rgba = oklchToRgb('oklch(0.18 0.01 80 / 0.5)');
    expect(rgba).toBe('rgba(20, 17, 13, 0.5)');
  });

  it('passes through existing rgb, rgba, or named colors unchanged', () => {
    expect(oklchToRgb('rgb(10, 20, 30)')).toBe('rgb(10, 20, 30)');
    expect(oklchToRgb('rgba(10, 20, 30, 0.8)')).toBe('rgba(10, 20, 30, 0.8)');
    expect(oklchToRgb('transparent')).toBe('transparent');
  });

  it('returns null from parseOklch on invalid input', () => {
    expect(parseOklch('not-a-color')).toBeNull();
    expect(parseOklch('rgb(1, 2, 3)')).toBeNull();
  });
});

describe('resolveCssColor', () => {
  it('resolves direct color without DOM when string is already rgb', () => {
    expect(resolveCssColor('rgb(20, 17, 13)')).toBe('rgb(20, 17, 13)');
  });

  it('resolves oklch string to rgb', () => {
    expect(resolveCssColor('oklch(0.18 0.01 80)')).toBe('rgb(20, 17, 13)');
  });
});

describe('tokensToMermaidVariables', () => {
  const sampleTokens: RemarqueTokens = {
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

  it('constructs light theme variables using tokens', () => {
    const vars = tokensToMermaidVariables(sampleTokens, false);
    expect(vars.primaryColor).toBe(sampleTokens.fg);
    expect(vars.primaryTextColor).toBe(sampleTokens.bg);
    expect(vars.primaryBorderColor).toBe(sampleTokens.fg);
    expect(vars.secondaryColor).toBe(sampleTokens.surface);
    expect(vars.secondaryTextColor).toBe(sampleTokens.fg);
    expect(vars.lineColor).toBe(sampleTokens.borderBold);
    expect(vars.textColor).toBe(sampleTokens.fg);
    expect(vars.clusterBkg).toBe(sampleTokens.errorSubtle);
    expect(vars.clusterBorder).toBe(sampleTokens.error);
    expect(vars.edgeLabelBackground).toBe(sampleTokens.bg);
    expect(vars.background).toBe('transparent');
    expect(vars.fontSize).toBe('14px');
  });

  it('constructs dark theme variables with light edge label background', () => {
    const darkTokens: RemarqueTokens = {
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
    const vars = tokensToMermaidVariables(darkTokens, true);
    expect(vars.primaryColor).toBe(darkTokens.fg);
    expect(vars.primaryTextColor).toBe(darkTokens.bg);
    // Flowchart edge labels in dark mode need light background for dark text readability
    expect(vars.edgeLabelBackground).toBe(darkTokens.fg);
    expect(vars.clusterBorder).toBe(darkTokens.error);
  });
});

describe('readRemarqueTokens and buildMermaidTheme', () => {
  it('reads tokens with fallback when running in node environment without full styles', () => {
    const tokens = readRemarqueTokens(null, false);
    expect(tokens.fg).toBeTruthy();
    expect(tokens.bg).toBeTruthy();
    expect(tokens.error).toBeTruthy();
    expect(tokens.borderBold).toBeTruthy();
  });

  it('buildMermaidTheme produces a valid base Mermaid configuration', () => {
    const config = buildMermaidTheme(null, false);
    expect(config.theme).toBe('base');
    expect(config.securityLevel).toBe('strict');
    expect(config.fontFamily).toContain('sans-serif');
    expect(config.themeVariables).toBeDefined();
    expect(config.themeVariables?.primaryColor).toBeTruthy();
    expect(config.flowchart?.curve).toBe('linear');
    expect(config.flowchart?.htmlLabels).toBe(true);
  });
});
