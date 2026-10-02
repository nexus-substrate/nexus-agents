---
'nexus-agents': patch
---

The gemini (agy) adapter now refuses read-only analysis tasks instead of running them with `--mode plan --sandbox`. A live run on 2026-10-02 with agy 1.2.15 showed that argv does not prevent writes: asked to, agy created a new file and modified a committed one. Read-only callers (consensus voter seats, pr_review, orchestrate workers, planning, decompose and dry-run stages) are now routed to an arm that enforces the mode, or get a refusal; a gemini voter seat now reports as errored rather than running unrestricted.
