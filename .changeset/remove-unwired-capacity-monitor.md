---
'nexus-agents': patch
---

remove the provider-header capacity monitor, unwired since it was written

`adapters/capacity-monitor.ts` and its helpers implemented real rate-limit
header parsing for Anthropic, OpenAI and Google — and had **zero production
constructors on any request path**. It was created 2026-01-05 as "Phase 2-4
infrastructure", ahead of a consumer, and nothing in seven months moved it
toward being wired; every commit since was an incidental repo-wide sweep.

The two issues that would have consumed it (#4456, #4373) are closed, so the
routing loop has already declined the signal.

Removed by a 7-voter `higher_order` panel, **unanimous**. Not public API — it
was absent from the named re-export list in `exports/adapters.ts`, and
`api-surface.txt` is byte-identical after the removal.

The wired `cli-adapters/capacity-tracker.ts` is untouched and remains the only
capacity signal routing consumes. The two were never duplicates: a CLI
subprocess adapter cannot read HTTP response headers, so the local estimator is
the only option there.

Fixes #4532.
