/**
 * Extensions the TypeScript compiler API path can parse (#4517).
 *
 * Exported so the tool layer can name them in its error message instead of
 * asserting a file "may not be TypeScript/JavaScript" without saying what
 * would count.
 */
export const SUPPORTED_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.js', '.jsx'];
