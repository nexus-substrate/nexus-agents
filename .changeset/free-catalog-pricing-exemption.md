---
'nexus-agents': patch
---

fix(registry): keep genuine :free catalog pricing through the zero-rate guard (#4209)

The #4176 $0/$0 pricing guard dropped pricing for ALL zero-rate generated-catalog
rows, but the openrouter `:free`-suffixed entries (e.g.
`openrouter/meta-llama/llama-3.3-70b-instruct:free`) are genuinely free — their
$0/$0 is real pricing, not a litellm placeholder, and they exist only in the
generated catalog. Ids ending in `:free` are now exempt from the guard, so
`computeCostDetail` reports a measured $0 (priced: true) for them instead of
UNPRICED/unmeasured, while non-`:free` $0/$0 placeholder rows still drop their
pricing. Also corrects the guard's doc-comment, which falsely claimed genuinely
free models live in-tree.
