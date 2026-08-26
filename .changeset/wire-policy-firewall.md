---
'nexus-agents': minor
---

fix(mcp): wire the PolicyFirewall to every tool, in warn mode

The firewall was constructed at startup, loaded its rules, and reached exactly
one log line. `buildStandardDeps` never forwarded it, no tool registration
passed it, and both middleware stacks attach their policy step only when the
config field is present — so no policy rule had ever been evaluated against a
real call, for any of the 47 registered tools.

It now reaches every secure handler through a process-wide registry
(`setGlobalPolicyFirewall`), the mechanism a 7-voter panel chose over explicit
DI (record #75, 5/5 approvers): a new tool cannot forget to read a registry, and
a forgotten hand-off is exactly how the gap arose.

Wired in **warn** mode, not the configured default. `getPolicyValues` defaults
`policyMode` to `'enforce'`, a default that has been harmless only because
nothing consumed the firewall; applying it on the release that lands the wiring
would turn rules that have never seen a live call into denials for every
operator at once. Warn evaluates every rule and logs every would-be denial,
which is the evidence an enforce decision needs. `NEXUS_MCP_POLICY_ENFORCE=1`
opts in.

The startup line that warned "configured but not wired" is replaced by one
reporting the mode actually in effect.
