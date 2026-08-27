---
'nexus-agents': patch
---

fix(build): ship the models.dev snapshot — installed copies enumerated zero models

`models-dev-snapshot-loader.ts` reads `models-dev-snapshot.json` as a sibling of
its own compiled module, so the file has to land in `dist/`. It was never in
tsup's copy list, and `package.json#files` ships only `dist/` — so **no
installed copy has ever contained it.**

The loader catches the failure and returns `[]`, so nothing was red. The effect:
every `claude` / `codex` / `gemini` model enumeration returned zero from the
published package, while dev — running from `src/config/` via tsx — returned
13 / 47 / 82. `opencode` (native probe) and OpenRouter (network) do not use the
snapshot and kept working, which masked it in every health report.

A second, latent defect surfaced while fixing it: `cp -r src/workflows/templates
dist/workflows/` nests when `dist/workflows/` already exists and copies the
source _as_ `dist/workflows` when it does not, so a clean build laid the
templates out flat and `template-loader.ts` — which looks for
`dist/workflows/templates` — found nothing. The target is now named explicitly.

`scripts/check-dist-assets.ts` fails the build when a runtime-read asset is
missing or truncated, and the `|| true` suffixes that let a failed copy pass
silently are gone.
