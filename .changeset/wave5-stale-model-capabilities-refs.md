---
'nexus-agents': patch
---

Wave 5 vestigial-code sweep: 6 stale references to `model-capabilities.ts` (renamed to `in-tree-data.ts` in #2546 slice E) updated to point at the current canonical surface.

Waves 3 + 4 (#2617, #2618, #2621, #2622, #2624) scoped their greps to `.md` + `.test.ts` files and to one round of source JSDoc audits. This sweep caught references that slipped through:

- `core/trace-pricing.test.ts:5` — module header docstring
- `learning/usage-log.ts:15, 38, 57` — 3 sites in JSDoc + interface docs
- `cli-adapters/adapters/gemini-adapter-helpers.test.ts:25` — inline comment
- `docs/design/ARCHITECTURE_MAP.json:72` — `canonical_paths.model_registry`

Pure documentation drift; no behavior change. CHANGELOG and `docs/archive/design-v2/` references intentionally left alone (frozen historical context).

Sweep methodology recorded in `cleanup_waves.md` (memory): cheap 15-min version — 5 parallel greps for sprawl filenames, `@deprecated`, dated TODOs, disabled workflows, recent renames. Found 0 hits on the first 4, real findings on the rename pattern (this fix).
