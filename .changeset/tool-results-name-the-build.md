---
'nexus-agents': patch
---

feat(mcp): every tool result names the build that produced it

The MCP server a client talks to is routinely a pinned global install rather
than the working tree, so a tool result read as evidence about "the current
code" could be answering from a months-old build with nothing in the response
to say which. `VERSION` reached only `serverInfo` at `initialize`, which a
long-lived session sees once and a log reader never sees at all.

Every tool result now carries `_meta['nexus-agents/build'] = { version }`,
stamped in `toSdkCallback` — the single point every registered tool passes
through, so a tool that builds its result by hand is stamped too.

It rides in `_meta` for the same reason the error envelope does (#2649):
`structuredContent` is validated against the tool's `outputSchema` with
`additionalProperties: false`, so an undeclared field there fails every call
with `-32602`. `_meta` is the spec's out-of-band channel and is never
schema-validated. The stamp extends `_meta` rather than replacing it, so a
structured error envelope survives alongside it.

Refs #5008 (build-identity half; the orphaned-process half stays open).
