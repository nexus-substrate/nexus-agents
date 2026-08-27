---
'nexus-agents': patch
---

security(clawguard): make the empty allowlist say `unmeasured`, delete the dead parallel adapter, and pin the reachability gap

The ClawGuard access-policy check decides on one field, `allowedTools`, and no
production producer ever writes a tool name into it — the LLM deriver is asked
for tool categories and pins `[]`, the keyword fallback hardcodes `[]`, and the
derivation-failure paths choose between `[]` and `'*'`. So `[].includes(name)`
was false for every call and the verdict was a constant function of
`(mode, isRiskyTool(name))`, independent of the objective, the LLM output and
the trust tier.

`checkAccess` now returns a new `unmeasured` decision for an empty allowlist
instead of falling through to a deny. The allowlist arm did not run; saying so
is not the same as saying the call was examined and refused. The middleware
allows the call, logs it, and deliberately does **not** record it as a
violation — recording it would give the #2077 enforce-flip denominator a
definitionally 100% violation rate that carries no information about precision.
The unbypassable denylist still runs first and still denies.

Also removed `guardMcpToolCall` and `createAccessPolicyMiddleware`, a second
copy of the enforcement adapter with no production caller and no entry in
`api-surface.txt`, and corrected three module headers that described behaviour
the code does not have: that `off` is the default mode (it has been `audit`
since v2.50), and that the denylist protects `~/.ssh/**`, `~/.aws/**` and
`/etc/shadow` "even in `off` mode" (it is reachable only from `checkAccess`,
which an absent policy short-circuits before). A denial now logs at `warn`
rather than `info`, so the blocking mode no longer logs below the observing one.

No behaviour change at runtime: the guard remains a pass-through at inbound MCP
dispatch. Which boundary it should guard is open in #5022 — a 7-voter panel
split 2-2-1-1 without clearing the bar — and the new
`access-policy-reachability.test.ts` pins the current behaviour so that question
cannot be answered silently by a change elsewhere.
