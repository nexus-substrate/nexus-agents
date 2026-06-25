---
'nexus-agents': patch
---

`consensus_vote`: an error-policy short-circuit now returns `no_quorum`, not a misleading `rejected` ([#4053](https://github.com/nexus-substrate/nexus-agents/issues/4053))

When a vote short-circuited because too many voters errored — the >50% hard floor, or
`fail_closed` — the response reported `decision: rejected` even when the responding voters
approved (e.g. quickMode with 2 of 3 voters erroring and the 1 responder approving). That
conflates "couldn't get enough valid votes" with "the panel rejected the proposal." Such a
short-circuit now returns **`no_quorum`** (the existing decision status for insufficient
valid voters); `policyReason` still rides the response to explain why. The internal vote
breakdown is unchanged.

Note (not a code change): the same report's `architect`/`security` voters failing with
`openai/<model>: HTTP 400` is NOT a per-role or prefix bug — voters round-robin across the
gateway's discovered models, the `openai/` is the `providerId` error format (the request
sends the bare id), and those specific models fail per-model on that gateway. Tracked in
#4049 / #4053.
