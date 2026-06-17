---
'nexus-agents': patch
---

fix(governance): refine tool-fitness suggest-signal heuristics (#3902)

Refines three signal-quality heuristics in the `tool-fitness` improvement_review
consumer flagged in the #3900 ratification (Contrarian's signal-quality
concerns). The Epic F invariant is preserved throughout: every signal is
suggest-tier only (severity `info`/`warning`, never `critical`, routed through
`assertNeverAutonomousRemoval`) — a human always reviews; nothing here removes a
tool.

1. **Consolidation: shared name-prefix is now only a WEAK hint.** A shared
   prefix is no longer treated as proof of substitutability. An orthogonal
   action-verb check suppresses prefix-siblings whose verbs sit in clearly
   opposed groups (`git_init` vs `git_commit`, `db_read` vs `db_drop_table`), so
   a rare sibling is never flagged for folding into a busy one on prefix alone.
   Surviving prefix-only matches are surfaced as LOW-CONFIDENCE candidates.
   Scoped step: a true capability/schema-overlap model is deferred behind a
   `TODO(#3902)` — until that data seam lands, prefix-family is never strong
   evidence.

2. **Break-glass exemption for low-usage-BY-DESIGN tools.** Rare-but-critical
   tools (rollback / recovery / emergency admin) are exempt from the
   `<= 2 invocations` deprecation flag via a never-deprecate predicate (default
   break-glass name patterns + an injectable `NeverDeprecateConfig`
   exempt-tools/extra-patterns override), removing false-positive deprecation
   noise.

3. **Workspace-scoped localized signal instead of full suppression.** When a
   tool's poor global rate is suppressed as context-poisoning (healthy in
   another workspace), the genuine localized failure is no longer fully
   silenced: a workspace-scoped "failing here" signal surfaces the local
   misconfig (global deprecation still suppressed).

New pure heuristics live in a sibling module
(`improvement-review-tool-fitness-heuristics.ts`) so the consumer stays under
the 400-line cap. RED-then-GREEN tests added for all three items.
