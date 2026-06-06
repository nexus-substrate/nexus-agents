---
---

docs(.rules/mcp): document tool-to-tool composition (engines in-process, envelopes across the tool boundary)

Clarifies the two composition boundaries for MCP tools (#3201): in-process
handlers call canonical domain engines directly (ConsensusEngine, PipelineRunner,
CompositeRouter), while cross-tool consumers parse the ToolErrorEnvelope and
branch on isRetryable. No shipped code changes (.rules/ is not in the package).
