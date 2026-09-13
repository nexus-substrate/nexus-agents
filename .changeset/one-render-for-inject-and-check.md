---
'nexus-agents': patch
---

`pnpm governance:check` now compares CLAUDE.md against the one render that `pnpm governance:inject` writes, so the two cannot disagree (#6099).

Before this, `inject` regenerated every governed section of CLAUDE.md (the agnostic block copied from AGENTS.md, the tool index, the workflow list, the model list, the version stamp) and then formatted the file, while `check` regenerated only the agnostic block and simulated the rest by splicing the on-disk block back into that partial regeneration. A stale model list — a section outside the agnostic block — passed `check` locally and failed CI's "inject, then `git diff --exit-code CLAUDE.md`" step. The render is now a single exported function, `renderClaudeMd`, composed from the same section generators in the same order and ending with the same prettier pass; `inject` writes its result and `check` fails when it differs from the file on disk.

The drift message still says whether the first differing line falls inside the `GENERATED:FROM_AGENTS` block (`CLAUDE.md GENERATED:FROM_AGENTS block is stale (#3446) — first difference at CLAUDE.md:N`, edit AGENTS.md and run inject) or outside it (`CLAUDE.md differs outside the generated block — first difference at CLAUDE.md:N`, run inject), because the two remedies differ. It names only the first difference: block drift and a stripped end-of-file newline in the same file are now reported one at a time, and one `inject` repairs both. A prettier failure during the check is still `governance:check: could not format <path>: <prettier message>` with exit 1.
