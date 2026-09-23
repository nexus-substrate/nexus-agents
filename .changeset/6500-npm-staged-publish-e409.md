---
'nexus-agents': patch
---

Handle npm's staged-publish window during release runs to prevent false E409 errors (#6500).

- Adds `scripts/publish-packages.ts` as the `changeset:publish` and `release` wrapper, which detects when npm returns `E409: Cannot publish over previously staged version "<version>"` for packages that are staged on npm but not yet queryable via `npm view`. If all failed packages are in this staged state, it logs the staged status, ensures the git tag exists, and exits successfully. Genuine failures (E403, network, etc.) continue to exit with error.
- Updates `scripts/count-unpublished-bumps.ts` to recognize git tags created within a 30-minute window (`DEFAULT_STAGED_WINDOW_SECONDS = 1800`) as `staged`, preventing premature unmeasured stall detections while npm processes staged tarballs.
- Updates `.github/workflows/release.yml`'s fallback publish step to check for recently created git tags (within 30 minutes) and stand down gracefully when packages are staged on npm.
