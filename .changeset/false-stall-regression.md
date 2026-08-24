---
'nexus-agents': patch
---

fix(agents): stop reporting a false stall on every long expert task

#4752 marked a heartbeat session "instrumented" when its scope opened, and let
an instrumented session with no heartbeats fall through to the stall
thresholds. The reasoning was that a scoped session emitting nothing must have
hung before its first step. Two facts make that wrong:

- **Nothing under `src/agents/` emits a `withStep`.** `SimpleAgent.executeTask`
  is a bare model call, so no step event is ever published from the agent work
  path and no heartbeat is ever credited.
- **The sessions nest.** `execute-expert` opens a session, then
  `base-agent-execute-flow` opens a second one inside it. The inner
  `AsyncLocalStorage` store shadows the outer, so even once producers exist the
  outer session receives no credit.

Net effect: every expert or agent task running past 120s logged
`Expert session stalled — no step activity` every 15s and inflated
`stalledSessions`. #4752 traded "structurally 0" for "structurally stalled",
which is not an improvement — the record was wrong in a new direction.

A session is now measured only once a heartbeat is actually **credited**.
Opening a scope is not evidence that anything will report progress. Nesting
becomes benign: an outer session with no credit stays `unmeasured` rather than
claiming a stall. An immediate hang remains covered by the 900s absolute cap
(`isExpired`), which does work.

Also fixes the same class in `measuredTrustTier` (#4751): it accepted `clientId`
as a derivation input, but `deriveTrustTier` reads `clientId` only inside its
`authenticated === true` branch — and `extractCallerInfo` returns exactly
`{ clientId, sessionId }` on its CLAUDE_SESSION_ID path. Wiring that producer
would have relabelled the `'3'` fallback as a measurement. `authenticated:
false` still counts, because "we checked and they are not authenticated" is a
measurement; only an absent field is not.

Found by an adversarial review of my own merged work.
