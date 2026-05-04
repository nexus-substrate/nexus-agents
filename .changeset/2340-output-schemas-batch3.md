---
'nexus-agents': patch
---

Add `outputSchema` to remaining 5 research\_\* MCP tools (#2340 batch 3 — closes the issue).

Final batch: `research_add_source`, `research_analyze`, `research_catalog_review`, `research_discover`, `research_synthesize`. Each handler switched from `toolSuccess(JSON.stringify(...))` to `toolSuccessStructured(...)` so the SDK validates `structuredContent` against the schema.

Permissive shapes throughout this batch — the response inner content varies per action/source/cluster, and CI runs hit partial-init paths where some fields are absent. Top-level field names are typed; nested data uses `z.unknown()`.

After this PR all 11 tools called out in the audit have `outputSchema`. The two remaining unschemaed tools — `weather_report` and `repo_analyze` — were intentionally deferred upstream (per the existing `outputSchema deferred for weather_report due to complex dynamic shape` note).
