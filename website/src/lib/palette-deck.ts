/**
 * Palette Deck decisions (remarque-tokens/deck). The runtime is remarque's
 * createDeck/bindPicker; this holds the site's few choices around it.
 */

/** The palette's localStorage key, shared by DeckInit's pre-paint restore and the picker's createDeck. */
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
