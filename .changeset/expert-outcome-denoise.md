---
'nexus-agents': patch
---

fix(governance): stop fabricated expert outcomes polluting routing signals (#3624)

Two de-noising fixes so the OutcomeStore (which feeds routing/learning + the
improvement signals) isn't skewed by fabricated attribution:

- **Drop expert-CREATION outcomes** — create_expert recorded creation success/
  failure as a model-execution outcome (`cli: DEFAULT_CLI='claude', model:'expert'`)
  even though creating an expert runs no model, polluting per-cli×category quality
  stats. Creation telemetry stays in session memory only.
- **Exclude unattributed outcomes from the CLI performance-floor** — outcomes
  whose cli/model is a placeholder (`unknown`/`expert`/`heuristic`/`default`)
  can't attribute a real executing CLI, so they no longer drive the routing
  quality signal (preventing the skew from landing on a real CLI).

consensus_vote (higher_order, 7/7) ratified the approach incl. DROP-over-TAG.
Positive registry-derived attribution (deriving cli/vendor/family from the
executed model) remains tracked in #3624.
