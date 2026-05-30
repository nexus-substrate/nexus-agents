---
'nexus-agents': patch
---

**fix(routing):** constrain LinUCB selection to the candidate set — fail-closed category overrides can no longer be bypassed (#3111).

`runLinUCBStage` returned whatever `LinUCBBandit.select()` picked, but `select()` ranks over **all** registered arms and ignored the already-filtered candidate list (`topsisRanking`). So a fail-closed category override (e.g. `security_review → [codex]`) or a quality filter could be silently defeated when the bandit's learned preference favored an excluded CLI — routing a security task to a CLI the policy had removed. The stage now falls back to the TOPSIS-best candidate when the bandit's pick is not in the candidate set. Learning attribution is unaffected: `recordOutcome` keys the reward update on the routed `cliName`. Found via a proactive security audit.
