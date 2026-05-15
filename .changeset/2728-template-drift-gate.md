---
'nexus-agents': patch
---

Pipeline integration tests now pin the `run_pipeline` tool description against `listTemplateIds()` ([#2728](https://github.com/williamzujkowski/nexus-agents/issues/2728)).

#2728 caught the case where `PIPELINE_TEMPLATES` registered 5 templates but three static description strings (`pipeline-tool.ts:46` JSDoc, `pipeline-tool.ts:163` MCP tool description, `scripts/tool-descriptions-data.ts:84` CLAUDE.md render) named only the pre-`general` 4: an LLM caller reading the MCP description would never pass `template: 'general'` because the surface said it didn't exist. The three strings were already fixed in earlier commits; this adds the missing acceptance criterion from #2728 — a test that fails the next time someone adds a template without updating the description.

Verified the gate fails pre-fix with the expected message `template id(s) missing from description: general`.
