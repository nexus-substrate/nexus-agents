---
'nexus-agents': patch
---

docs(readme): tighten the closed-loop tagline to human-gated/demotion-only reality (#3909)

From the #3907 ratification honesty-of-framing note. The README headline read as fully autonomous ("closed-loop self-tuning"), but the loop does not close autonomously: tier promotion is earned via the ADR-0017 authority ladder (human-gated ratification), and the `TuneAdjustmentStore` is bounded and demotion-only — autonomous changes only ever reduce authority/aggressiveness. Reworded the root and package taglines to "human-gated closed-loop tuning (autonomous demotion, earned promotion)" so a reader seeing only the one-liner does not infer full autonomy. Prose only; no code changes.
