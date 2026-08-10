---
'nexus-agents': patch
---

Repoint the stale `openrouter-qwen-coder` registry entry (#4410)

The entry pointed at `qwen/qwen3-coder-480b-a35b:free`, an id absent from the live models.dev catalogue in every form, so any routing that selected it dispatched an unservable `--model` at opencode. Because it was also priced `0/0`, the cost-aware stages saw a free option that was really a guaranteed failure.

OpenRouter still serves the family, but no longer at a zero-cost tier. Repointed to `qwen/qwen3-coder` — verified as the same checkpoint (`name: "Qwen3 Coder 480B A35B"`, 262K context), which is what licenses carrying the existing quality scores over — priced at the catalogue list rate of 0.3/1 per 1M, with `cost` re-scored 10 → 9 (10 is reserved for genuinely zero-cost entries) and "free" dropped from the display name and notes.

The zero-cost tier now contains only `openrouter-nemotron-super`, which is an accurate reflection of the live catalogue rather than a reduction in capability. Decided 7/0 via `higher_order` consensus.
