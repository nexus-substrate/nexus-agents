---
'nexus-agents': patch
---

fix(mcp): consensus_vote async mode no longer fails every call

`consensus_vote` declares an `outputSchema`, so the SDK requires
`structuredContent` on every non-error result. Its async branch dispatches
through `runAsJob`, whose envelopes are text-only, so **every**
`consensus_vote({ mode: 'async' })` call failed with
`-32602: has an output schema but no structured content was provided` — the mode
the tool's own description recommends for 7-voter higher-order panels.

The dispatch now supplies structured envelopes via `runAsJob`'s `toEnvelope`
hook, and the schema declares the `status` / `jobId` / `pollTool` / `note` /
`retryAfterMs` fields they carry. The vote fields become optional, because a
tool with two response shapes cannot express a discriminated union through
`registerTool`'s `ZodRawShape`. `status` distinguishes them: present means an
async-dispatch envelope, absent means a completed vote.

What that gives up is requiredness. What it keeps is the guarantee that protects
the protocol — `additionalProperties: false` still rejects an **undeclared**
response field, which is the #5044 regression the schema exists to catch, and
there is now a test pinning that specifically.

Of the eleven tools using `runAsJob`, only `consensus_vote` declares an
`outputSchema`, so the blast radius was exactly one tool.

Closes #5066.
