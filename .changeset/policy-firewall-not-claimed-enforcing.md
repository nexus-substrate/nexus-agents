---
'nexus-agents': patch
---

stop the server logging a policy firewall it never applies

Startup logged `policyFirewallEnabled: true` and `policyMode: 'enforce'`, which
reads as "policy enforcement is on". It is not. The firewall is constructed,
passed to `registerMcpTools`, and used for nothing but that log line:
`buildStandardDeps` never forwards it, no tool registration supplies it, and
`createPolicyMiddleware` is therefore never reached for any tool.

The two fields are removed and replaced by a warning naming the configured mode,
so an operator who set a policy mode is told it is inert rather than handed a
quieter boolean. A hardcoded `false` would have been the same constant with the
sign flipped.

A test asserted `policyFirewallEnabled: true, policyMode: 'enforce'`, pinning
the claim as intended behaviour; it now asserts the fields are absent.

The wiring itself is #4888 — a real behaviour change that wants staging, not a
flip.
