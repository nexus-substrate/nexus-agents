---
'nexus-agents': patch
---

Fix the website deploy building without the API reference (#4507).

#4449 moved TypeDoc generation to build time, with the ordering in `turbo.json`: `nexus-agents-website#build` → `nexus-agents#docs:api:md` → `nexus-memory#build`. But `deploy-website.yml` ran `pnpm build` with `working-directory: website`, which invokes Astro directly and **bypasses turbo entirely**, so the graph never applied.

The result deployed successfully with the entire `/api/` section missing — `/api/` and `/api/cli-adapters/` returned 404 on the live site. The only trace was a warning in the build log: `[glob-loader] The base directory ".../docs/api/" does not exist`. A missing Astro content collection is not a build error, so the broken command **exits 0**.

The deploy now builds through turbo from the repo root (`npx turbo run build --filter=nexus-agents-website`) so the dependency graph resolves, and a new step fails the deploy when the build output contains zero `/api/` pages.

Verified both directions: the corrected command produces 20 `/api/` pages, and the previous `cd website && pnpm build` produces 0 while still exiting 0 — so the guard catches precisely the regression that shipped.
