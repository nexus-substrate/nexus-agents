---
'nexus-agents': patch
---

strip nested injection tags the single-pass sanitizer reassembled

`sanitizeString` in the MCP tool-input sanitizer did one `replace`, which
reconstructs the tag it removes. Verified against the file's own regex:
`<sys<system>tem>x</sys</system>tem>` came out as a live `<system>x</system>`.

It now loops to a fixed point, the same approach `input-sanitizer.ts` has used
since #1496. This copy guards the path that ingests fork-authored PR
descriptions, so it is the one that mattered most.
