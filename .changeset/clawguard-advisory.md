---
'nexus-agents': minor
---

security(clawguard): demote the access-policy middleware to advisory

Step 1 of epic #5105, implementing the ratified #5022 decision: ClawGuard stops
being an enforcement mechanism and PolicyFirewall becomes the single tool
authorization boundary. Panel: 6/1 approve, option split E:4 / B:2, leading
share 66.7%, threshold met.

The middleware still runs and still evaluates the derived policy, but it can no
longer deny. A verdict that would have blocked is now logged and written to the
durable sink, and the call is forwarded. `denyToToolResult` is removed, so the
inability to deny is structural rather than a branch someone could restore by
accident.

This incidentally fixes the ClawGuard half of the durability inversion (#5101).
Previously only the log-and-allow branch reached the hash chain, so the modes
that blocked wrote nothing tamper-evident while the mode that merely observed
did. With no deny branch left, every verdict that fires is recorded, and
`matchedRule` travels with it so a chain reader can tell an unbypassable
denylist hit from an allowlist miss.

No runtime behaviour change: the middleware has never had a policy in scope at
inbound MCP dispatch (#5022), so nothing was being denied to begin with. The
reachability test still fails if the mount is removed, which keeps this step
from silently doing #5107's work.

Mode semantics in `NEXUS_ACCESS_POLICY_MODE` now select how much is REPORTED
rather than what is prevented. The mode names are kept because they are a
documented env-var contract; renaming them is a breaking change and is resolved
with the deriver itself in #5108. README and CONFIGURATION.md no longer
advertise enforcement.

Released as a **minor**, not a patch: `ClawGuardViolationEvent` gains an optional
`matchedRule` field, and the API-surface gate classifies an additive optional
field on an exported interface as minor for readers. Three type changes shipped
mis-versioned before that gate existed (#4736, #4740, #4744); it reports what
moved and leaves the level to a human, so this is that call.
