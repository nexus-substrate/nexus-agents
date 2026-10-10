PIPELINE NOTE: #7231 promotes `npx remarque-audit` in `.github/workflows/deploy-website.yml`
from an advisory check to a blocking gate by removing `continue-on-error: true`.

The Mermaid theme initialization in `website/src/components/PageScripts.astro` has been
refactored to derive all theme variables dynamically from Remarque CSS custom properties
via `website/src/lib/mermaid-theme.ts` instead of using hardcoded hex color literals.
Render error styling now references `var(--color-error)`, and the font-size clamp in
`website/src/styles/docs.css` on `.docs-body h2` has been replaced with the Remarque
`var(--text-section)` token.

As a result, `remarque-audit --palette node_modules/remarque-tokens/tokens-palette.css --src src`
clears with 0 errors across all 72 palette contrast checks and all source policy scans,
making the audit step a blocking gate in website CI.
