---
'nexus-agents': patch
---

**docs(skills):** add a branch-safety guard to the `pre-push-parity` skill (#3072).

The harness can silently switch an agent's working branch mid-session — a long run can end up on `main` carrying another branch's uncommitted edits, risking lost work or an accidental push to `main`. The skill's pre-push one-shot now gates on `git branch --show-current` being a non-empty, non-`main`/`master` branch (`PARITY OK (<branch>)`), and a new "Branch safety" section documents the STOP-and-recover habit. This is the in-repo agent-side mitigation; the underlying harness branch-switch bug (#3072) is upstream.
