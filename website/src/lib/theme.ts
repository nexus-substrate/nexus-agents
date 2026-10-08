/**
 * Light/dark theme logic for the docs site (#7199, #7313).
 *
 * The storage key is shared by the pre-paint restore (ThemeInit.astro) and
 * the toggle island (ThemeToggle.svelte) so the two cannot drift apart. The
 * decisions are pure so the island stays a thin DOM binding.
 *
 * @module website/lib/theme
 */

/** localStorage key for the docs light/dark choice. */
export const THEME_STORAGE_KEY = 'nexus-docs-theme';

export type Theme = 'light' | 'dark';

/** A stored or attribute value as a theme, or undefined for no choice. */
export function storedTheme(value: string | null | undefined): Theme | undefined {
  return value === 'light' || value === 'dark' ? value : undefined;
}

/**
 * Whether the page is dark: a chosen `[data-theme]` wins, otherwise the OS
 * preference. An unknown attribute value counts as no choice.
 */
export function effectiveDark(chosen: string | null | undefined, osDark: boolean): boolean {
  const theme = storedTheme(chosen);
  return theme === undefined ? osDark : theme === 'dark';
}

/** The theme one press of the toggle selects: the opposite of what shows. */
export function toggledTheme(chosen: string | null | undefined, osDark: boolean): Theme {
  return effectiveDark(chosen, osDark) ? 'light' : 'dark';
}
