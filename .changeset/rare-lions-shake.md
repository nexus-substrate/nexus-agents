---
'nexus-agents': patch
---

learning: remove the two dead `tainted` filter branches and the security-gate claim they carried (#5853)

`DistilledRule.tainted` was documented in three places as a security gate — "tainted rules never promote to RoutingMemory", "security gate — tainted rules never reach consumers per Phase 5 acceptance". Nothing in production could set it. `upsertRule` writes the literal `false` and is the only constructor of new rules; the only other ingress passes through a persisted file written from those same rules. So both consumer branches were unreachable, and `DistilledRuleStage.findMatchingRules` — the channel by which distilled rules actually reach routing — never checked the flag at all.

The two branches and the claims are gone. Not a live exploit: the field was inert in the *safe* direction, so the harm was that a reader of `context-retriever.ts` concluded the substrate screens untrusted-derived rules when it does not.

The field itself stays for now — removing a required member of a published interface is breaking — relabelled as reserved-with-no-producer, with removal queued in #5867 alongside #5467. Two tests that passed only by constructing a record production cannot emit were rewritten; a new test pins that the filter no longer discriminates on the flag, so the dead conjunct cannot quietly return without a producer.

Remedy chosen by a live 7-voter panel (option E, 6/6 on the option tally, every voter stating that the published-API framing changed their answer).
