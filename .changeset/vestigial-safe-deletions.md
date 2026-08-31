---
'nexus-agents': patch
---

chore: delete two vestigial exports with no reference anywhere

Both had exactly one line mentioning them — their own declaration — and neither
appears in `api-surface.txt`, so no external implementor contract is affected.

- `mcp/tools/orchestrate-sica.ts` — `getSicaAgentFromOrchestrator` was
  unconditionally `return undefined` with a discarded parameter. Its own comment
  said it "exists for future extensibility... Currently returns undefined as we
  don't store the reference." Even if it had been called, every caller's
  non-undefined branch was dead.
- `pipeline/security-gate.ts` — `lastOsvVulnerabilities` module state was
  written on every scan and read only by `getLastOsvVulnerabilities`, which had
  zero references repo-wide, including in its own test. The write is removed
  with the accessor, which also drops a piece of module-level state that
  persisted across pipeline runs in the same process.

This is the shape #5242 removed from the same `security-gate.ts` file, left
behind by that sweep.
