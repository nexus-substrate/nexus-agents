---
'nexus-agents': patch
---

fix(learning): make the distiller's draft floor real

`minObservationsForDraft` is documented as "minimum observations before creating
a draft rule (default: 3)" and changed nothing: `computeStatus` returned
`'draft'` from both the guarded branch and the fallthrough, and no detector
enforces a group-size floor. One failing task in a category produced a persisted
`failure-rate` rule at `observationCount: 1` — occupying one of the 90 rule
slots and penalising a CLI at routing time on the evidence of a single run.

The floor now gates creation. An existing rule still updates below it, since the
config governs when a rule comes into being, not whether it stays current.
