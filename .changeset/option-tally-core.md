---
'nexus-agents': patch
---

Option-tally threshold core and `selectedOption` plumbing for multi-option votes (#4472, increment 2a).

Internal groundwork. **No behaviour change to `consensus_vote` yet** — the public `options` input is deliberately withheld until threshold evaluation actually reads the tally, so the tool cannot advertise semantics it does not have.

New `consensus/option-tally.ts` implements the semantics a 7-voter `higher_order` panel chose 6-1 on the design fork: an approving voter whose selection is absent or matches no declared option **stays in the denominator and credits no option**. The decisive property is that this is monotone-downward — a degraded voter response can only _lower_ the leading option's share, never raise it — so degradation is a denial, never an escalation. The rejected alternative (dropping non-selectors from the denominator) reads 1 selector among 6 unparseable as 1/1 = 100% "unanimous", rebuilding the #4452 masking bug.

No per-threshold special-casing is needed: any non-selecting approver caps the leading share below 100%, so `unanimous` fails by arithmetic when the panel cannot articulate one choice.

The tally carries `unattributedApprovals` / `selectedCount` / `approverCount` — the panel's mandatory condition. A share alone cannot distinguish dissent from absence: `4 pick X + 3 unparseable` reads 57%, identical to a real 4/3 split.

`selectedOption` now flows prompt → structured schema → parse → `AgentVoteResult`. An unmatched selection resolves to **absent, never a default**, so a parse miss records as unmeasured rather than invented agreement.

Also fixes a real bug the `VOTE_JSON_SCHEMA` drift contract caught: with `additionalProperties: false`, a structured-output voter could not have emitted `selectedOption` at all.
