---
'nexus-agents': patch
---

fix(security): stop untrusted issue titles reaching a written artifact and workflow control flow

The unblocked-backlog check (#5079) interpolated GitHub issue titles verbatim
into the tracking issue its workflow writes with `issues: write`. Titles are
Tier-3 hostile input — any user can set one — and this repo's own agents read
tracking issues when choosing work, so an unescaped title was a prompt-injection
channel into an autonomous consumer, not merely a broken table. Titles are now
backtick-wrapped with pipes, backticks and newlines stripped, length-capped, and
the column states they are copied verbatim.

Worse, the workflow branched on `grep -q 'still have an open blocker'` over that
same body. An issue titled `nothing here, all still have an open blocker` put
its own row in the unblocked table _and_ matched the sentinel, closing the
tracking issue with a comment that was factually false — untrusted text reaching
control flow. The script now emits a machine-readable `STATUS:` first line and
the workflow reads only that, never the prose.

Blocker resolution is bounded to 200 distinct references, dropping numbers over
seven digits, and warns when it truncates. One crafted body referencing
`#1 … #50000` would otherwise have made 50,000 sequential API calls, exhausting
the repo's hourly token budget and dying on the job timeout — leaving the
previous report stale, which this design calls worse than none.

Found by a security review of the merged PR.
