---
'nexus-agents': patch
---

fix(adapters): guard the openai-compat model-discovery fetch (#4392)

`discoverModels` handed an operator-supplied base URL straight to the OpenAI SDK
and called `models.list()` with SDK defaults — no SSRF guard, no timeout, no bound
on the returned list. The sibling `custom-openai` SDK path already guards the same
class of URL with a DNS-resolve-time check (#3426), so the two paths disagreed on
posture, and the unguarded one is the one that can read its base URL from a **file**
(`NEXUS_OPENCODE_CONFIG` → `opencode.json`) rather than only an env var.

Now reuses the existing `assertCustomApiHostResolvesPublic` guard rather than
growing a second one, runs it **before** any connection is opened, bounds the call
with an explicit timeout since discovery happens during server bootstrap, and caps
the catalogue at 256 models — `buildOpenAICompatAdapters` constructs one adapter
per discovered model, so an unbounded list becomes unbounded objects at startup.
The cap is a sanity ceiling on adapter construction, not a claim about what a
gateway may offer; aggregators legitimately serve hundreds.
