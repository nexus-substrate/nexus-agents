---
---

fix(docs): correct CLI-vs-routing-arm JSDoc drift in CompositeRouter + allEntries tier list in ModelRegistry (#3519)

CompositeRouter: getCapacityDashboard and getCandidateCliNames docs said "CLIs"
but both return RoutingArmId (= CliName | ApiArmId, i.e. CLI slots + api:\* arms,
#3422) — getCapacityDashboard's impl doc had gone stale vs its ITaskRouter
interface doc. ModelRegistry: allEntries() doc said "in-tree + models.dev +
manifest (authoritative)" but returns ALL tiers incl. generated, and isn't
filtered to authoritative. JSDoc-only, no behavior change. Epic #3516 / #3519.
