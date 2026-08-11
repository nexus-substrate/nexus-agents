---
'nexus-agents': patch
---

Correct the advertised context window for `openrouter-nemotron-super` (#4416)

The entry dispatches `nvidia/nemotron-3-super-120b-a12b:free` but carried `contextWindow: 1_000_000`, which is the _paid_ variant's window. models.dev lists both, and the free SKU serves 262,144.

`contextWindow` is what context budgeting and model-eligibility filtering read, so a task assembling between 262K and 1M tokens passed the local check and was then rejected by the provider — after the context had been built. Unlike the dead pointer in #4410 the model is live, which is why this never surfaced.

Corrected to `262_144`, keeping the free SKU: repointing to the paid id would empty the zero-cost tier, which #4410 just reduced to this single entry. Added a general assertion that no entry dispatching a `:free` SKU claims a seven-figure context, so the paid/free metadata split cannot recur silently.
