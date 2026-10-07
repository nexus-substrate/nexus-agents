/**
 * localStorage key for the docs light/dark choice. Shared by the pre-paint
 * restore (ThemeInit.astro) and the toggle (ThemeToggle.astro) so the two
 * cannot drift apart.
 */
export const THEME_STORAGE_KEY = 'nexus-docs-theme';
