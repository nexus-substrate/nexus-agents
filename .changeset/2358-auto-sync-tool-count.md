---
'nexus-agents': patch
---

Auto-sync MCP tool count + tools[] across all release surfaces (#2295 follow-up).

Adding a new MCP tool in #2358 (`survey_oss_landscape`) required manual edits in 7 places — `server.json` (tools[] array + description prose), `website/src/data/site-data.ts` (`MCP_TOOL_COUNT`), `docs/design/components.md` (3 inline mentions), and `README.md` (architecture diagram + capabilities table). The `Docs Content Drift` CI gate (#2107) caught the drift but didn't auto-fix.

Extended `scripts/inject-governance.ts` to write all of these from the authoritative `STANDALONE_TOOLS` list:

- `syncServerJson` now writes `tools[]` (was: only version + description count).
- New `syncWebsiteToolCount` updates `MCP_TOOL_COUNT` in site-data.ts.
- New `syncDesignDocsToolCount` updates the 3 mentions in components.md.
- New `syncReadmeToolCount` updates the 2 mentions in README.md.

Test files (`tool-annotations.test.ts`, `index.test.ts`, `cli-server-tools.test.ts`) keep their hardcoded counts intentionally — they're contract gates that caught the original drift in PR #2358 and shouldn't become tautologies.
