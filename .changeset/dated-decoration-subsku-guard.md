---
'nexus-agents': minor
---

feat(registry): dated-decoration matching and sub-sku fail-closed guard (#4183)

The fuzzy-resolution identity tier now tolerates ONE trailing snapshot-date
segment on a decorated gateway id (`claude-opus-4-8-20250514` resolves to the
canonical `claude-opus-4-8` pricing/metadata) — fail-closed: the fallback only
applies when the canonical entry's own version is date-free, so snapshot-style
dated canonicals (`gpt-4o-2024-08-06`) still require full version equality.
Sub-SKU decorations now fail closed: a size/tier quirk (`-mini`/`-lite`/
`-nano`, `-large`, `7b`-style) on the decorated id that the canonical candidate
lacks abandons the match instead of inheriting the parent SKU's pricing;
mode/feature quirks (`thinking`, `high`, `vision`) still match. Also threads
the resolved model identity through `getEntry` so derivation-bound misses
resolve it once instead of twice.
