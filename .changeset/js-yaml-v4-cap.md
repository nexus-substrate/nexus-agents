---
'nexus-agents': patch
---

Cap the `js-yaml` pnpm override at `^4.2.0` (#4124). The prior override was a security
floor (`>=4.2.0`) with no upper bound, so a grouped dependency bump (#4120) could resolve
the tree to js-yaml v5 — which dropped the CJS `default` export and broke the astro website
build via `@astrojs/internal-helpers`. Capping at `^4.2.0` keeps the CVE security floor while
holding js-yaml at v4 (which astro is compatible with) until astro supports v5.
