---
'nexus-agents': patch
---

test(mcp): round-trip four more tools against their declared output schemas

A response field missing from a tool's `outputSchema` does not merely go
unreported: the SDK validates structured content with
`additionalProperties: false`, so every call fails with `-32602` and the tool
becomes unusable. That shipped once and was caught only because `memory_query`
happens to be round-tripped in the integration suite.

A tool's own tests cannot see it — they call the registered handler directly and
never cross the protocol — so the guard has to be a real client call.
`memory_write`, `research_synthesize`, `run_workflow` and `research_add` now
make one, asserting narrowly: a business failure is fine, an output-schema
violation is not.

Partial coverage of #5045, which remains open for the tools this harness does
not register.
