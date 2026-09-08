---
'nexus-agents': patch
---

Doc-only: `WorkflowRouter`'s `confidence`, and the `MetaDecision` /
`RunResponse` fields it flows into, are now documented as what they are — a
per-rule source PRIOR, not a measurement of the routed task (#5957). Every rule
returns an authored literal and nothing the analyzer observes reaches the
number, but three declarations described it as "Confidence in the selection
(0-1)", which reads as a score. Same call `triangulated-review.ts` made for the
identical shape under #5119. A characterization test pins the constant-ness so
that deriving it from an observation fails until the declarations are updated.
No behaviour change.
