/**
 * Palette Deck decisions (remarque-tokens/deck). The runtime is remarque's
 * createDeck/bindPicker; this holds the site's few choices around it.
 */

/** deck.js's default storage key; DeckInit.astro's pre-paint restore reads it too. */
export const PALETTE_STORAGE_KEY = 'remarque-palette';

/** The label for the site's own palette (the radio with value=""). */
export const DEFAULT_PALETTE_LABEL = 'Site default';

export interface DeckPalette {
  name: string;
  label: string;
}

/** The label shown for the active palette; null or an unknown name is the site default. */
export function paletteLabel(palettes: readonly DeckPalette[], name: string | null): string {
  return palettes.find((p) => p.name === name)?.label ?? DEFAULT_PALETTE_LABEL;
}
