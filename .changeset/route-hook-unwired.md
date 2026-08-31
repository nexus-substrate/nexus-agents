---
'nexus-agents': patch
---

fix(hooks): a mapped-but-unwired hook event no longer succeeds silently

`routeHook` returned a bare `exitSuccess()` for two different facts:

- **unmapped** (`Notification`, `Setup`) — correct; we never claimed to handle
  those.
- **mapped, but no handler registered** — a gap in our own wiring, reporting
  success.

`EVENT_TO_HANDLER` maps 7 events while `createAllHandlers` supplies 5, so
`SubagentStop` and `UserPromptSubmit` land in the second case.

The unwired case now writes a line to stderr naming the event. **The exit code
stays 0 deliberately**: a non-zero exit from a hook can block the user's
operation, and a gap in *our* configuration must not do that. What changes is
that the silence becomes visible.

Scope, stated precisely: this is narrower than "2 of 7 events silently no-op".
Our setup registers only the same 5 (`setup-mcp.ts:360`), `createCommandHandlers`
accepts only those 5 subcommands, and an unknown subcommand already exits loudly.
The reachable path is `nexus-agents hooks` with **no subcommand**, which routes
stdin by `hook_event_name` through `createAllHandlers` — a hand-configured
`SubagentStop` hook lands there.

Implementing the two missing handlers would be YAGNI; making the gap
distinguishable is the actual defect, and it is two lines.
