---
'nexus-agents': patch
---

Bring the repo-root `scripts/` tree into the lint scope (#4483).

`pnpm lint` is `turbo lint`, which only reaches each workspace's own `eslint src/`. The root `scripts/` directory — governance generators, drift gates, the tool-reference generator, the release helper — was outside every lint scope. The code that enforces the repo's rules was itself unenforced, and had accumulated 7 deprecated-API errors nothing reported.

Adds `lint:scripts` and a CI step that runs it. The scope was extended **first** and confirmed to fail with all 7 errors before anything was fixed, so the gate is demonstrated to catch something rather than landing already-green.

Fixes the 7: `.passthrough()` → `.loose()` and `z.string().url()` → `z.url()` in `build-model-registry-types.ts`. Verified behaviour-preserving by running the generator — it exits clean and produces a byte-identical registry, so this is a rename, not a semantic change.

`sync-plugin-version.ts` gets the file-level `no-console` disable its 38 sibling scripts already carry; a build script's stdout is its interface.
