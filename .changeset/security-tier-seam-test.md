---
'nexus-agents': patch
---

test(security): pin the securityTier producer→consumer seam (#5120 item 4)

No behaviour change. `securityTier` had three production declaration sites and
**zero test files referencing it anywhere in the repo**, so deleting any one of
them silently downgraded that tool to the permissive `'standard'` default —
prompt-injection payloads stop being rejected, with no failure and no log, on
exactly the surface `.rules/untrusted-input.md` exists to protect.

Verified by mutation: deleting `securityTier` from `issue-triage-tool.ts`,
`research-add-source.ts`, or `orchestrate.ts`, forcing `checkSecurityTier` to
always pass, or flipping the `?? 'standard'` default each now fail a test. Every
one of those passed before.
