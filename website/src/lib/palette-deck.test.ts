import { describe, expect, it } from 'vitest';
import manifest from 'remarque-tokens/deck.json';
import { DEFAULT_PALETTE_LABEL, paletteLabel } from './palette-deck.ts';

const palettes = [
  { name: 'nord', label: 'Nord' },
  { name: 'gruvbox', label: 'Gruvbox' },
];

describe('paletteLabel', () => {
  it('names the active palette', () => {
    expect(paletteLabel(palettes, 'gruvbox')).toBe('Gruvbox');
  });

  it('names the site default for null and for an unknown stored name', () => {
    expect(paletteLabel(palettes, null)).toBe(DEFAULT_PALETTE_LABEL);
    expect(paletteLabel(palettes, 'no-such-palette')).toBe(DEFAULT_PALETTE_LABEL);
  });

  it('knows an empty deck has only the default', () => {
    expect(paletteLabel([], 'nord')).toBe(DEFAULT_PALETTE_LABEL);
  });
});

describe('remarque deck manifest', () => {
  it('has palettes with a name and label each', () => {
    expect(manifest.palettes.length).toBeGreaterThan(0);
    for (const p of manifest.palettes) {
      expect(p.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(p.label).not.toBe('');
    }
  });
});
