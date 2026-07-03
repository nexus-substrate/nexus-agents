---
title: Decorated Gateway Model Names & Pricing
description: How the model registry resolves decorated model names from OpenAI-compatible gateways to canonical pricing, when a manifest alias is still required, and how unpriced calls surface as UNMEASURED in cost output
tier: 2
keywords: [pricing, registry, gateway, manifest, overlay, cost, billing, unmeasured, fuzzy]
---

# Decorated Gateway Model Names & Pricing

OpenAI-compatible gateways often expose vendor models under decorated names — `Claude_Opus_4.8_hardened`, `2025-claude-opus-4_0_high` — that don't match any canonical registry id. This guide explains what the registry resolves automatically (#4164), when you still need a manifest-overlay alias (#2547), how to keep prices fresh, and how an unpriced call surfaces in cost accounting (#4165). It assumes you already have a gateway wired up per [CUSTOM_ENDPOINT_SETUP.md](./CUSTOM_ENDPOINT_SETUP.md).

**Key takeaways**

- Decorated names resolve automatically when they normalize to a known id/alias, or when their parsed `vendor + family + version` identity matches exactly one registry entry. Version equality is required; ambiguity fails closed.
- A fuzzy match grants **pricing and capability metadata only** — behavior and request-shaping fields never transfer.
- Dated decorations (`claude-opus-4-8-20250514`) resolve too (#4183): one trailing snapshot-date segment is ignored when the canonical entry's own version carries no date. Version-less and ambiguous decorations still do not resolve — declare those in `models-manifest.yaml` instead.
- Sub-SKU decorations (`-mini`, `-lite`) **fail closed** (#4183): a size/tier marker the canonical entry lacks means a different SKU, so no pricing is inherited. Declare gateway sub-SKUs explicitly to give them their real price.
- A model with no pricing anywhere in the chain is **UNMEASURED, never $0** — decision-cost totals become a floor, flagged via `measuredVoters < voterCount`.

## What resolves automatically

On an exact-id and alias miss, `ModelRegistry.getEntry()` runs a two-step resolution tier (#4164) before falling back to bare derivation. Both steps are deterministic and fail closed — a wrong price is worse than no price. Ids longer than 256 characters skip the tier entirely.

**Step 1 — normalized retry.** The id is normalized (lowercase; `_` and `/` become `-`; runs of `-` collapse; leading/trailing `-` trimmed) and the exact lookup is retried, so case/separator variants of a known id or alias resolve. `Claude-Sonnet-4` finds `claude-sonnet-4`; manifest aliases keep working through this retry.

**Step 2 — identity match.** The decorated id is parsed into `{vendor, family, version}` and matched against a load-time index of every loaded entry:

- **Version equality is required on both sides.** Version keys treat `.` and `-` as equal, so a decorated `4.8` matches a canonical `4-8`. An id that parses without a version never identity-matches.
- **One trailing date segment is tolerated on the decorated side (#4183).** `claude-opus-4-8-20250514` parses to version `4-8-20250514`; when no entry matches it exactly, a single trailing 6–8-digit date segment is stripped and `4-8` is retried. The fallback is fail-closed: it only applies when the canonical entry's own version is date-free, so snapshot-style ids whose date _is_ the version (`gpt-4o-2024-08-06`) still require full equality.
- **Size/tier markers fail closed (#4183).** If the decorated id carries a size/tier quirk (`mini`/`nano`/`tiny`/`small`/`lite`, `large`/`xl`/`big`/`maxi`, or a `7b`-style parameter count) that the canonical candidate lacks, the match is abandoned — `claude-opus-4-8-mini` is a different SKU, not decorated Opus 4.8. Mode/feature markers (`thinking`, `high`, `vision`, `coder`, `instruct`) are variants of the same SKU and do not block.
- **Candidates are consulted tier-ordered.** Authoritative tiers (manifest, in-tree) are checked first; the breadth catalogs (models.dev, generated LiteLLM) only get a look when no authoritative candidate exists.
- **Effective duplicates are collapsed, then uniqueness is enforced.** Catalog entries that normalize to the same id, or share identical pricing _and_ context-window/max-output envelope, count as one. If more than one distinct candidate survives, the match is abandoned — no guessing.

So `Claude_Opus_4.8_hardened` parses to `anthropic / claude-opus / 4.8`, matches the canonical `claude-opus-4-8` entry, and picks up its pricing.

### What deliberately does not resolve

| Decoration      | Example                                   | Behavior                                                                                                                                                                                               |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Version-less    | `claude-opus-hardened`                    | No version parses → no identity key → derivation only (no pricing)                                                                                                                                     |
| Ambiguous       | identity matches two distinct entries     | Fails closed → derivation only (the date-stripped retry obeys the same tier-order/dedupe/uniqueness rules)                                                                                             |
| Wrong-base date | `claude-opus-4-9-20250514` (no 4.9 entry) | Date-stripping only tolerates the date — the remaining version must equal a canonical one → no match                                                                                                   |
| Dated snapshot  | `gpt-4o-2024-08-06-20250101`              | The canonical's version _is_ the date → full equality required; extra date segments never strip their way onto a snapshot entry ([#4183](https://github.com/nexus-substrate/nexus-agents/issues/4183)) |
| Sub-SKU         | `claude-opus-4-8-mini`                    | Size/tier marker absent from the canonical → different SKU → fails closed instead of inheriting Opus pricing ([#4183](https://github.com/nexus-substrate/nexus-agents/issues/4183))                    |
| Over-long       | id > 256 chars                            | Fuzzy tier skipped entirely                                                                                                                                                                            |

**Sub-SKU pricing.** Size markers parse as quirks, not version segments, so before #4183 `claude-opus-4-8-mini` identity-matched the full `claude-opus-4-8` entry and inherited its (higher) pricing. It now fails closed — which also means a sub-SKU has **no pricing at all** until you declare it explicitly in the manifest (example below) with its real price. A decoration whose size marker exists on the canonical side too (`claude-haiku-4-5-lite-hardened` against a declared `claude-haiku-4-5-lite`) still matches normally.

### Provenance and merge semantics

A fuzzy-matched entry is a fresh copy that keeps the **caller's** id and stamps two provenance fields:

- `matchedVia` — `'normalized'` or `'identity'`. Absent for exact/alias hits and pure derivation.
- `resolvedFrom` — the canonical id the pricing/metadata came from.

The matched canonical entry grants **capability metadata only**: `pricing`, `contextWindow`, `maxOutputTokens`, `displayName` (plus modalities and quality scores). Behavior fields (`parallelToolCalls`, `promptCaching`, `toolDefinitionFormat`, `strictJson`, quirks, profile) always come from derivation of the original decorated id, and request-shaping fields (`unsupportedParameters`, `maxTokensParam`), alias/CLI routing, and `verifiedAt` are never inherited — those belong to the canonical entry, not your gateway's variant of it.

Implementation: [model-registry.ts](../../packages/nexus-agents/src/config/model-registry.ts) and [model-fuzzy-resolution.ts](../../packages/nexus-agents/src/config/model-fuzzy-resolution.ts).

## When to use a manifest-overlay alias instead

Reach for the operator manifest (#2547) whenever automatic resolution can't or shouldn't apply: version-less decorations, ambiguous names, sub-SKUs (which fail closed since #4183 and need their own price declared), or gateway-only models the registry has never heard of.

The operator manifest lives at `<NEXUS_DATA_DIR>/models-manifest.yaml` (default `~/.nexus-agents/models-manifest.yaml`), or wherever `NEXUS_MODELS_OVERLAY_PATH` points. A per-user overlay (`models.yaml` / `NEXUS_MODEL_REGISTRY_OVERLAY`, #3351) uses the same schema at lower precedence — the operator entry wins on id collision. Manifest entries sit at the **top** of the pricing chain, above in-tree data.

```yaml
# ~/.nexus-agents/models-manifest.yaml
version: 1
models:
  # Alias a version-less decorated gateway name to canonical metadata.
  # Aliases are matched verbatim (plus the normalized retry), so use the
  # exact string your gateway reports.
  - id: claude-opus-4-8
    vendor: anthropic
    family: claude-opus
    version: '4-8'
    aliases:
      - Claude_Opus_hardened # version-less: would NOT fuzzy-resolve
    displayName: Claude Opus 4.8 (gateway)
    contextWindow: 200000
    maxOutputTokens: 32000
    pricing:
      inputPer1M: 5.0 # USD per million input tokens
      outputPer1M: 25.0 # USD per million output tokens

  # A sub-SKU fails closed since #4183 (it never inherits Opus pricing) —
  # declare it as its own entry so it gets its REAL price instead of none.
  - id: claude-opus-4-8-mini
    vendor: anthropic
    family: claude-opus
    displayName: Opus 4.8 Mini (gateway SKU)
    pricing:
      inputPer1M: 1.0
      outputPer1M: 5.0
```

Only `id`, `vendor`, and `family` are required — behavior fields default sensibly. The loader is fail-closed: a missing or malformed manifest never crashes; invalid entries are rejected individually and logged. Run `nexus-agents registry doctor` to see the overlay's load status, entry count, and any per-entry rejections. Manifest edits are picked up on the next process start (or by an in-process reload such as `registry refresh` triggers, #3185).

Schema: [manifest-overlay.ts](../../packages/nexus-agents/src/config/manifest-overlay.ts).

## Pricing sources and freshness

Pricing resolves through the full registry chain, highest priority first:

| Tier | Source                    | Notes                                                    |
| ---- | ------------------------- | -------------------------------------------------------- |
| 1    | Manifest overlay          | Operator `models-manifest.yaml` beats user `models.yaml` |
| 2    | In-tree entries           | Measured/validated in the repo                           |
| 3    | models.dev snapshot       | Seeded externally, bundled                               |
| 4    | Generated LiteLLM catalog | ~1,000-entry long-tail breadth; lowest priority          |

To update the LiteLLM-sourced generated catalog without an npm release (#3707):

```bash
nexus-agents registry refresh --source=<url> [--dry-run]
```

This downloads a `model-registry.generated.json`, verifies it against its `<url>.sha256` sidecar, writes it to `<NEXUS_DATA_DIR>/model-registry.generated.json`, and hot-reloads the in-process registry. The loader prefers that refreshed copy over the bundled package copy; other already-running processes need a restart (or their own refresh) to pick it up. A default GitHub-release source is planned (#2180) — until then, supply your own mirror URL.

For contributors working from a repo checkout, `pnpm check:pricing-drift` cross-checks in-tree pricing and context windows against the community LiteLLM catalog. It's advisory — it prints a diff table and always exits 0 — useful after a provider price change or before a release.

## Cost accounting semantics

Every per-call cost is computed by `computeCostDetail(modelId, inputTokens, outputTokens)` in [usage-log.ts](../../packages/nexus-agents/src/learning/usage-log.ts), which reads the full chain above including the fuzzy tier. It returns:

- `costUsd` — micro-USD-rounded cost. Always `0` when `priced` is false.
- `priced` — whether the resolved entry carried pricing. `false` means _unknown cost_, not free.
- `resolvedId` — the canonical id the pricing came from (`resolvedFrom` on a fuzzy match, else the caller's id).
- `matchedVia` — fuzzy-resolution provenance, when the tier matched.

Usage-log lines (`<NEXUS_DATA_DIR>/usage/usage-YYYY-MM.jsonl`) carry the same provenance as `priced` and `priceSource` fields, so an audit can tell a real $0 from an unpriced model.

**Unpriced is UNMEASURED, never $0.** In governed decisions (`consensus_vote`, `pr_review`), a voter whose model has no pricing anywhere in the chain — or that reported no usage at all — is folded into the decision-cost summary as _unmeasured_ ([decision-cost.ts](../../packages/nexus-agents/src/observability/decision-cost.ts), #3855/#4165). Its tokens still count toward consumption totals; its unknown cost contributes 0 with `unmeasured: true` on the per-voter line. Read the summary accordingly:

- `voterCount` / `measuredVoters` / `unmeasuredVoters` — when `measuredVoters < voterCount`, `totalCostUsd` is a **floor**, not an exact figure. Treating unmeasured as a measured $0 would silently understate spend.
- A genuinely free model arrives as an explicit `costUsd: 0` and stays _measured_.

**`NEXUS_BILLING_MODE` interaction.** The rollup applies the billing mode last:

- `plan` (the default) — spend is pre-covered by a subscription, so every cost is recorded as $0 _by construction_ while token counts are kept, allowing a later `api`-mode reprice from the same data.
- `api` — the registry-derived `costUsd` is used as-is; unpriced models remain unmeasured regardless of mode.

So under `plan` a $0 total is expected; under `api`, check `unmeasuredVoters` before trusting the total. If a decorated gateway name keeps showing up unpriced, either confirm it fuzzy-resolves (look for `priceSource` in the usage log) or add a manifest entry for it — that is the supported way to give a gateway-only model a real price.

## Related

- [CUSTOM_ENDPOINT_SETUP.md](./CUSTOM_ENDPOINT_SETUP.md) — wiring an OpenAI-compatible gateway (transport/credentials)
- [CLOUD_PROVIDERS.md](./CLOUD_PROVIDERS.md) — gateway paths for cloud-hosted models
- [CONFIGURATION.md](../getting-started/CONFIGURATION.md) — `NEXUS_MODELS_OVERLAY_PATH`, `NEXUS_BILLING_MODE`, and friends
