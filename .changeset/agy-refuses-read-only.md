---
'nexus-agents': patch
---

The gemini (agy) adapter now refuses read-only analysis tasks instead of running them with `--mode plan --sandbox`. A live run on 2026-10-02 with agy 1.2.15 showed that argv does not prevent writes: asked to, agy created a new file and modified a committed one. Read-only callers (consensus voter seats, pr_review, orchestrate workers, planning, decompose and dry-run stages) are now routed to an arm that enforces the mode, or get a refusal.

Consensus panels on the CLI path no longer seat the gemini CLI at all. Seats are dealt round-robin only over CLIs that enforce read-only analysis (claude, codex, opencode), so the default 7-seat panel stays whole instead of losing the two seats (security and catfish) that used to land on gemini and would now refuse. With claude, codex and opencode installed the panel is architect, ai_ml and scope_steward on claude; security and pm on codex; devex and catfish on opencode. A CLI dropped for this reason is named in an info log line. The gateway path and `NEXUS_VOTER_MODEL_<ROLE>` pins are unchanged.
