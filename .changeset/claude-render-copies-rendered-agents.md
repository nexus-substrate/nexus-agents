---
'nexus-agents': patch
---

fix(governance): the CLAUDE.md render copies the rendered AGENTS.md, so a stale AGENTS.md value is reported once (#6167)

`governance:check` now reports a stale AGENTS.md generated value — a count
phrase or a toolchain footer row — as one finding, on the AGENTS.md line it
sits on. Before, the CLAUDE.md render copied AGENTS.md's AGNOSTIC:BODY slice
from the file on disk rather than from the AGENTS.md render, so the same stale
value was also reported as `CLAUDE.md GENERATED:FROM_AGENTS block is stale`,
with the stale value labelled `expected` and the correct on-disk CLAUDE.md
value labelled `on disk`. The verdict and the remedy were right; the CLAUDE.md
line was a misreported cause.

`governance:inject` and `governance:check` each render AGENTS.md once and use
that string for both files, so CLAUDE.md's render is a fixed point whenever
CLAUDE.md is current and only AGENTS.md is stale. When prettier rejects
AGENTS.md, the check reports that once and names CLAUDE.md as unmeasured
instead of printing a second formatter line. No generated output changes on a
current tree.
