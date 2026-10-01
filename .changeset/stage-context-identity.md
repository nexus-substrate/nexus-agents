---
'nexus-agents': minor
---

Expose stage, plugin, and pipeline identity in StageContext. Compiled handlers populate stageId, pluginId, and pipelineId (the plan's taskId); these fields remain optional for compatibility with externally constructed contexts.
