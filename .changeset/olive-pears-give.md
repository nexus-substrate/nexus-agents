---
'nexus-agents': minor
---

Close out the model-lifecycle epic: delete the remaining substitution surface (#4408, #4420)

Decided 7/0 (`higher_order`). Step 1 removed the retry/factory/streaming wrapper; this removes what was left:

- **`resolveLiveModelId`** (`config/resolve-live-model.ts`) mapped a configured model id to a _different_ live id. Same objection as step 1 one layer down: the adapter records `model: task.model` — the **requested** id — while the substituted id was local to argument construction, so a substituted call attributed its outcome to a model that never served the request. Dormant in practice (gated on `NEXUS_DYNAMIC_MODELS`, default off, plus a cache nothing populates), and it did not fire for #4410, the one real incident it existed for.
- **`replacedBy`** on `ModelCapabilitySchema` — zero readers and zero writers. A schema field nobody populates or consumes describes a capability that does not exist.

Step 2 ("wire a runtime diagnosis naming candidate siblings") is closed as **superseded**. #4417's offline drift sweep answers the same question at refresh time — before anything is dispatched — with no cache, flag, or network, and is mutation-verified against both historical bugs.

`MODEL_NOT_FOUND` continues to surface unchanged with its structured code.

The #3408 rate-limit cooldown intent survives: a cooled model is still never dispatched. What changed is the recovery — the adapter now omits `--model` and lets OpenCode use its own default, explicitly and logged, instead of silently picking a sibling and attributing its outcome to the requested model.
