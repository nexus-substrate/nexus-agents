---
'nexus-agents': minor
---

Report manifest-overlay prices as basis `declared` in trace pricing, usage cost details, decision-cost records and cost-ceiling logs. Reuse the existing manifest-tier provenance, including fuzzy matches, while keeping in-tree and catalog rates `list` and preserving the `list | declared | unknown` vocabulary for JSONL and MCP consumers. Honor overlay pricing on the first trace lookup and describe declared rates with a caveat that covers both manifest and gateway declarations.
