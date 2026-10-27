---
'nexus-agents': patch
---

Preserve producer build metadata on newly completed and failed `execute_expert` task results, including synchronous SDK fallback responses. Historical results retain their original producer metadata or its absence, and existing error metadata is preserved.

Native task creation remains blocked by #7599, so native producer provenance is UNMEASURED. This change does not enable native task creation or establish publication readiness.
