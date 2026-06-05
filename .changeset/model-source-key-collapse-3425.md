---
'nexus-agents': patch
---

fix(routing): collapse api:\* arm keys in model-source registration (#3425)

After #3422, the router's adapter map can be keyed by `api:<vendor>` arm ids.
`buildDefaultModelSources`/`registerDefaultModelSources` iterated those keys and
would register an availability source under the literal `api:anthropic` name.
Harmless today (the candidate filter gates on the display slot), but a future
model-source consumer iterating raw keys could see an `api:*` key where a CLI
slot is expected. Sources are now named by the display slot
(`routingArmDisplaySlot`); the cache de-dups by name, so a CLI slot and its api
arm collapse to one slot-named source.
