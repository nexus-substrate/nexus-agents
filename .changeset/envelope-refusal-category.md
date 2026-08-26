---
'nexus-agents': patch
---

fix(run): report an undeclared execute envelope as a refusal, not an engine fault

`classifyDispatchError` enumerated refusal classes with `instanceof`.
`ExecuteEnvelopeRefusalError` — added later, and deliberately not a subclass of
`AuthorityRefusalError` because it answers a different question — was not in the
list, so it fell through to `errorCategory: 'internal'`. A plain
`run({ goal, execute: true })` routes to `single-shot`, which declares no
execute envelope, so an ordinary call told the caller the engine had a defect;
on the async path the job was recorded failed with the same framing.

The three refusal types now share a `PolicyRefusalError` base and the classifier
keys on that. The classification is structural rather than a list: a new refusal
type is a `business` outcome by construction and has to opt out, instead of
being misclassified by omission — which is how this one was missed.
