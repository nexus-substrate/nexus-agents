---
'nexus-agents': patch
---

test(mcp): round-trip every tool that declares an `outputSchema` through a real client

A response field the tool's `outputSchema` does not declare is not a cosmetic
drift: the SDK validates structured content with `additionalProperties: false`,
so every call to that tool fails with `-32602` and the tool becomes unusable.
Handler-level tests cannot see it — they never cross the protocol.

The round-trip list is now derived from the server's own `listTools()` rather
than hardcoded, so a newly registered schema-declaring tool fails the suite
until it is given arguments, and a tool that drops its `outputSchema` fails too.
Six schema-declaring tools that needed only the base deps were added to the test
server. Tools whose round-trip returns an error envelope — nothing for the SDK
to validate — are named in a pinned list rather than silently counted as passes.

Closes #5045.
