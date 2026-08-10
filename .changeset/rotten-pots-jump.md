---
'nexus-agents': patch
---

fix(routing): let API arms record outcomes under their own id, and surface warm-start skips (#4400)

`OutcomeCliSchema` was `CliName | 'unknown'` with no `api:*` member, so no
`TaskOutcome.cli` could ever equal an API arm's id — even though the router
genuinely registers `api:anthropic`, `api:openai`, `api:google` and
`api:custom-openai` as arms under `NEXUS_BILLING_MODE=api`.

`LinUCBBandit.warmStart` matches arms **by name** (`armIndex < 0 → continue`), so
every API arm discarded its entire history and began each process cold, with the
skip reported nowhere. The schema now accepts `ApiArmIdSchema`, kept beside the
`ApiArmId` type so the two cannot drift. The union only grows, so previously
persisted records stay valid.

`warmStart` now counts skipped outcomes per arm and logs them. A warm-start that
silently drops most of its input looked identical to one that worked, which is how
this stayed invisible.

Precondition for #4392: giving a gateway a routing arm before this would have
produced an arm that looks wired and learns nothing across runs.
