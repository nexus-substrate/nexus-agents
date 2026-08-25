---
'nexus-agents': patch
---

label routing-audit's simulated budget stage, and stop duplicating the bandit builder

`routing-audit` rendered a green `Budget Filter (4/4 pass)` identically to the
TOPSIS and LinUCB stages beside it — and those two construct real routers,
while `simulateBudgetFilter` passes every CLI unconditionally with no cost
estimate, token count or config read.

The source was candid about it (the function name, its JSDoc, and the call-site
comment all say "simulated"), but none of that reached the terminal. Someone
debugging a selection saw budget filtering apparently evaluated and ruled it out
as a cause. The stage now renders as
`[simulated — not evaluated against real cost or config]`.

Separately, the audit kept a byte-equivalent copy of `taskProfileToBanditContext`.
The two agreed only by coincidence: #4874 gave the production builder an
optional real budget figure whose default is the same neutral `0.5` the copy
hardcoded, so their outputs matched while the definitions had already parted.
The audit now delegates, with a test pinning that the two agree — an audit that
can drift from the router it audits reports a decision the router would not make.

Fixes #4843.
