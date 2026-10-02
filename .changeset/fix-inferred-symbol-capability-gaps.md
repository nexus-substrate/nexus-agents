---
'nexus-agents': patch
---

Report missing language support when a task explicitly requests symbol extraction for a named file extension or language. Inferred gaps appear in capability reports but stay out of the research ledger unless `NEXUS_CAPABILITY_GAP_INFERRED=1` is set; observed tool refusals continue to be recorded.

Limit inferred sources to known source-language extensions and explicit language positions in the request clause. Persist inferred and observed provenance while accepting legacy ledger rows without an origin.
