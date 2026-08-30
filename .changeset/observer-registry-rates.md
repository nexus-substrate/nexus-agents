---
'nexus-agents': minor
---

fix(observability): price orchestration cost from the registry, not a private table (#5180)

**Default cost figures change, mostly upward.** `OrchestrationObserver` kept its
own per-model price table (`claude: 0.015` per 1K, blended) and applied it to
total tokens, discarding the input/output split its own caller held two lines
earlier. Output bills at several times input, so an output-heavy run was
understated — 10k in / 90k out on claude reported **$1.50** where the registry's
10/50 per 1M gives **$4.60**.

Measured shift on 10k in / 90k out with no override configured: claude 3.07x,
gemini 11.0x, codex 2.75x, opencode 1.38x. These are corrections, not
regressions, but they are a step change in a telemetry series — operators with
alert thresholds on `costMetrics.totalCostUsd` should expect it.

**Existing configs are unaffected.** This is the answer to the dissent on the
ratifying panel, which asked for a migration path rather than an unannounced
shift. A bare-number `tokenCostRates` entry still means exactly what it always
meant — one blended rate over total tokens — and produces byte-identical
figures, verified across five cases. Only installs with **no** override see the
new defaults. An operator who wants the old numbers changes nothing.

`tokenCostRates` now also accepts `{ input, output }` per 1K for an accurate
split override. Resolution order: split override, then blended scalar override,
then registry split rates. Omitted means registry, never zero.

Two things caught by measuring rather than assuming, both of which would have
been worse than the original bug:

- The observer keys on a **CliName** (`claude`), not a model id
  (`claude-fable-5`). Asking the registry for the CliName returns unpriced, so a
  naive lookup reported **$0 for every model** — a 100% understatement replacing
  a 3x one. It now resolves through `getDefaultModelForCli`.
- `getDefaultModelForCli` **throws** on an unknown name. This runs on the routing
  hot path, so it now fails soft and contributes 0 rather than taking down a
  routing call to record a metric.

Ratified 6/6 on the option (approved 6-1). Concern-registry alternates: 2 → 1.
