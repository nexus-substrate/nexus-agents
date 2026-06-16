---
'nexus-agents': patch
---

fix(orchestration): harden manifest-driven router (#3888 — #3886 follow-ups)

Closes the three confirmed follow-ups from the #3886 ratification vote, all
confined to the manifest router. No live routing decision changes for the 8
registered manifests.

- **Alternatives split-brain (DRY):** `buildAlternatives` no longer seeds the
  transparency "alternatives" list from the hardcoded `strategyFromPattern` /
  `strategyFromPipelineType` decision table (which encoded the pre-#3836 rules and
  could drift from the manifests). It now derives alternatives from the SAME
  manifest `selectionRules` source of truth via the new
  `rankStrategiesByManifest`, ranking every OTHER matching strategy best-first by
  matching-rule priority. The two now-dead `strategyFrom*` helpers — and their
  re-exports from `meta-orchestrator.ts` and `orchestration/index.ts` — are
  removed. Observable change: the alternatives list now contains only genuinely
  manifest-routable runner-ups (best-first), instead of the former
  pattern+pipeline+`orchestrate` heuristic triple.
- **Optional `selectionRules` → silent un-routability:** a new Vitest asserts every
  manifest in `STRATEGY_MANIFEST_REGISTRY` declares at least one `selectionRule`,
  so a future manifest added without rules (silently un-routable) fails the test
  suite. (`selectionRules` stays `.optional()` on the schema to keep force-only
  manifests legal; the test guards the live registry — lower-risk than a schema
  change.)
- **Name-based tie-break:** `selectStrategyByManifest` no longer breaks an
  equal-priority collision silently by `strategy < best.strategy` (alphabetical
  name). A genuine equal-priority tie between two strategies now throws
  `AmbiguousManifestSelectionError`, surfacing a future overlapping same-priority
  rule loudly instead of letting a rename quietly change routing. No reachable tie
  exists on today's 8 manifests, so this is dead-but-defensive now.
