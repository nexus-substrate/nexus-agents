---
'nexus-agents': patch
---

docs(rules): trace to the producer, and treat a pass as evidence only once you know what it measured

Two investigation techniques added to `.rules/debugging.md`, ratified 5/6 by a
`higher_order` panel. Overlap with the existing rules was measured first: most of
what this session used is already covered by the Triage Sequence and the
Anti-Rationalization table, so the addition is deliberately two table rows and
one triage step, not a section.

**Trace to the producer, not the guard.** The word "producer" appeared in no rule
file, yet the dominant defect class found this session is one shape: the check
reads correctly and nothing upstream can make it fire. ClawGuard deciding on an
`allowedTools` no producer populates; `proof_of_learning` reporting weighted
approval where `updateAgentPerformance` has zero non-test callers;
`falsePositiveRate` published as measured from a constant verdict; three
governance gates reading ledgers no producer writes.

**A pass is evidence only once you know what it measured.** Distinct from the
existing "It works on my machine" row, which is about environment diffs. This is
the opposite direction from "This is flaky, ignore it": that row says do not
ignore a failure, this says do not trust a pass. It is the direction that hid
#5134 — `research_synthesize` erroring on every real call while CI stayed green,
because CI's registry is empty and the tool returned nothing to validate.
