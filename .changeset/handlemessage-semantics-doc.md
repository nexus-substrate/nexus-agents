---
---

docs(core): document IAgent.handleMessage delivery semantics (#3222)

Specifies that handleMessage is a direct awaited request/response call (not the
fire-and-forget event bus): ordering is caller-sequenced, there is no automatic
retry/redelivery, and errors surface as Result.err. JSDoc-only on the IAgent
contract — no behavior or API-shape change. The finding's MessageQueueConfig /
persistence layer is declined as speculative (no consumer).
