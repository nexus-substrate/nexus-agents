---
'nexus-agents': minor
---

feat(memory): say which backends memory_query could actually reach

`count: 0` was the same observation whether nothing matched the query or the
SQLite-backed stores were absent — every unavailable backend contributes an
empty result set silently, and the response carried no field able to say so. A
caller asking "do we know anything about X?" was told "no" when the honest
answer was "two of the five stores are not installed here".

The response now carries `searched` and `unavailable`. `session` and `belief`
are always present; `agentic`, `adaptive` and `typed` are optional and are named
when missing. Both lists are scoped to the requested `source`, so asking for one
backend does not claim the others were searched.

This is the availability half of #4999. A backend that is installed but throws
mid-query still contributes `[]` silently — each per-backend helper catches and
returns an empty array — and that half needs the error status threaded out of
`tool-memory-query.ts`.
