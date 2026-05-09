---
name: docs-chart
description: |
  Generate dark-mode-compatible inline SVG charts (bar, donut, line,
  lollipop, area, radar) for nexus-agents docs from quantitative data —
  OutcomeStore metrics, fitness scores, CLI success rates, vote pass-rates,
  weather report data. Use when the user says "chart", "visualize data",
  "svg chart", "render chart", or asks to compare CLI metrics. Cross-
  references docs-mermaid (precise diagrams) and docs-image (illustrative).
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
---

# Inline Data Visualization Charts Skill

<!--
  CANONICAL SOURCES:
  - .rules/docs-rubric.md (Source/Evidence dimensions)
  - skills/docs-mermaid (precise diagrams — sequence/state/etc.)
  - skills/docs-image  (illustrative AI-gen)
  - existing CLI: `nexus-agents usage` and `nexus-agents weather_report` produce the data
    these charts visualize.

  Adapted from AgriciDaniel/claude-blog skills/blog-chart/SKILL.md (MIT,
  694⭐). Reframed for nexus-agents data sources; dropped the
  blog-cadence "diversity required within one post" rule since technical
  docs reuse the same chart type as needed.
-->

## When to apply

Use inline SVG charts when nexus-agents docs reference quantitative data:

| Data source                                                          | Best chart type   |
| -------------------------------------------------------------------- | ----------------- |
| OutcomeStore success-rate-by-CLI                                     | Horizontal bar    |
| Per-call cost from `usage-log.jsonl`                                 | Donut (per model) |
| Fitness audit history (target ≥ 90/100)                              | Line chart        |
| CLI success rate over time                                           | Line / area       |
| Voter approval distribution                                          | Lollipop          |
| Cost-per-success comparison                                          | Grouped bar       |
| Multi-dimensional model scoring (reasoning / speed / cost / quality) | Radar             |

Mermaid handles sequence / state / flow diagrams (see `docs-mermaid`),
but renders quantitative charts ugly and inflexibly. SVG is the right
tool for "compare these numbers." Each rendered chart is dark-mode-
compatible (uses `currentColor` for text + transparent backgrounds) and
includes a `role="img"` + `aria-label` for accessibility.

## Step 1 — Identify the chart type

Look at the data pattern:

| Pattern                                                 | Chart type         |
| ------------------------------------------------------- | ------------------ |
| Before/after comparison (claude vs codex success rates) | **Grouped bar**    |
| Ranked factors / correlations (per-CLI categories)      | **Lollipop**       |
| Parts of whole / market share (cost split per model)    | **Donut**          |
| Trend over time (fitness score by week)                 | **Line**           |
| Percentage improvement (single dimension)               | **Horizontal bar** |
| Distribution / range (latency p50/p99)                  | **Area**           |
| Multi-dimensional scoring                               | **Radar**          |

Don't reuse the same chart type for _unrelated_ data within the same
section, but feel free to use it again where the data shape repeats —
e.g., two horizontal-bar comparisons in different parts of an
architecture doc is fine.

## Step 2 — Render with the canonical SVG shell

All charts share this shell (`viewBox` may be tuned per chart):

```xml
<svg
  viewBox="0 0 560 380"
  style="max-width: 100%; height: auto; font-family: 'Inter', system-ui, sans-serif"
  role="img"
  aria-label="<one-line description with the headline number>"
>
  <title>Chart Title</title>
  <desc>Description for screen readers with all key data points and source.</desc>

  <!-- Chart content (axes, bars, labels) -->

  <text x="280" y="372" text-anchor="middle" font-size="10"
        fill="currentColor" opacity="0.35">
    Source: Source Name (Year)
  </text>
</svg>
```

Color palette (dark-mode safe, all text uses `currentColor`):

| Color    | Hex       | Use case                        |
| -------- | --------- | ------------------------------- |
| Orange   | `#f97316` | Primary / highest value         |
| Sky blue | `#38bdf8` | Secondary / comparison          |
| Purple   | `#a78bfa` | Tertiary / special category     |
| Green    | `#22c55e` | Quaternary / positive indicator |

For text inside colored fills, use `fill="white"` with `font-weight:800`.

## Step 3 — Pull data from canonical sources when applicable

For nexus-agents-specific data, reach for these existing surfaces
rather than asking the operator for raw numbers:

| Need                              | Read from                                    |
| --------------------------------- | -------------------------------------------- |
| Per-call cost / latency / success | `<NEXUS_DATA_DIR>/usage/usage-YYYY-MM.jsonl` |
| Per-CLI rolling success rate      | `weather_report` MCP tool output             |
| Vote outcomes by role             | `<NEXUS_DATA_DIR>/voting/*.jsonl`            |
| Fitness audit history             | `<NEXUS_DATA_DIR>/audit/fitness-*.json`      |
| Routing decision distribution     | `query_trace` MCP tool output                |

When the data isn't available locally, ask the operator for a JSONL or
CSV path — don't fabricate numbers.

## Cross-references — when to redirect

This skill is the quantitative-charts lane. Redirect when the request
fits a different lane:

- **Sequence / state / flow / class / ER diagram** → `docs-mermaid`
- **Hero or conceptual illustration** → `docs-image`
- **Doc structure / placement** → `documentation-management`

Say the rule of thumb when redirecting: _"Charts are for numbers; for
'show me how X works', use docs-mermaid."_

## What this skill does NOT do

- **Architecture / sequence diagrams** — those belong in `docs-mermaid`.
- **Live charts** — output is static SVG. If the data needs to update,
  re-run the skill against fresh JSONL.
- **Server-side rendering / build-time generation** — produces SVG
  strings; embedding into a doc is the doc author's choice.
- **Theme customization** — uses `currentColor` so the doc's existing
  theme handles light/dark. Don't override.

## See also

- `references/chart-types.md` — copy-pasteable templates for all seven
  chart types with nexus-agents-flavored examples.
- `nexus-agents usage --format=json` — JSON output suitable for direct
  ingestion by chart rendering.
