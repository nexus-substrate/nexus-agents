# Chart Type Templates

Copy-pasteable inline SVG templates for the seven chart types that work
in nexus-agents docs (markdown, GitHub README, the website). All
templates use `currentColor` so they render correctly in both
light-mode and dark-mode contexts.

Adapted from claude-blog `skills/blog-chart` (MIT). Examples are
nexus-agents-flavored.

## 1. Horizontal bar — single dimension comparison

**Use when:** comparing one metric across N entities. CLI success
rates, model adoption percentages, fitness scores.

```xml
<svg viewBox="0 0 560 200"
     style="max-width: 100%; height: auto; font-family: 'Inter', system-ui, sans-serif"
     role="img"
     aria-label="Per-CLI vote success rates: claude 91%, codex 75%, gemini 87%">
  <title>Per-CLI Vote Success Rates (last 7 days)</title>
  <desc>Claude: 91%. Codex: 75%. Gemini: 87%. Source: weather_report.</desc>

  <!-- Y-axis labels -->
  <text x="80" y="55" text-anchor="end" font-size="12" fill="currentColor" opacity="0.8">claude</text>
  <text x="80" y="100" text-anchor="end" font-size="12" fill="currentColor" opacity="0.8">codex</text>
  <text x="80" y="145" text-anchor="end" font-size="12" fill="currentColor" opacity="0.8">gemini</text>

  <!-- Bars (width = 4 * value) -->
  <rect x="90" y="40" width="364" height="24" fill="#f97316" rx="2" />
  <text x="460" y="58" font-size="14" fill="currentColor" font-weight="800">91%</text>

  <rect x="90" y="85" width="300" height="24" fill="#38bdf8" rx="2" />
  <text x="396" y="103" font-size="14" fill="currentColor" font-weight="800">75%</text>

  <rect x="90" y="130" width="348" height="24" fill="#a78bfa" rx="2" />
  <text x="444" y="148" font-size="14" fill="currentColor" font-weight="800">87%</text>

  <text x="280" y="190" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.35">
    Source: weather_report MCP tool, 2026-05-09 (ET)
  </text>
</svg>
```

## 2. Donut — parts of whole

**Use when:** spend split across providers, vote outcome distribution,
model market share within a setup.

```xml
<svg viewBox="0 0 320 280"
     style="max-width: 100%; height: auto; font-family: 'Inter', system-ui, sans-serif"
     role="img"
     aria-label="Cost split last 7 days: claude $1.00, gpt-4o $0.47, gemini $0.18">
  <title>Cost Split by Model (last 7 days)</title>
  <desc>claude-sonnet $1.00 (60%); gpt-4o $0.47 (28%); gemini-pro $0.18 (12%). Total $1.65. Source: nexus-agents usage.</desc>

  <!-- Donut: full circle. Use stroke-dasharray to segment. -->
  <!-- Circumference of r=70 is ≈ 440. Segments: 60%/28%/12% → 264/123/53. -->
  <circle cx="160" cy="120" r="70" fill="none" stroke="#f97316" stroke-width="32"
          stroke-dasharray="264 440" stroke-dashoffset="0" transform="rotate(-90 160 120)" />
  <circle cx="160" cy="120" r="70" fill="none" stroke="#38bdf8" stroke-width="32"
          stroke-dasharray="123 440" stroke-dashoffset="-264" transform="rotate(-90 160 120)" />
  <circle cx="160" cy="120" r="70" fill="none" stroke="#a78bfa" stroke-width="32"
          stroke-dasharray="53 440"  stroke-dashoffset="-387" transform="rotate(-90 160 120)" />

  <!-- Center label: total -->
  <text x="160" y="115" text-anchor="middle" font-size="14" fill="currentColor" opacity="0.45">
    Total
  </text>
  <text x="160" y="135" text-anchor="middle" font-size="20" font-weight="800" fill="currentColor">
    $1.65
  </text>

  <!-- Legend -->
  <rect x="40" y="220" width="12" height="12" fill="#f97316" />
  <text x="58" y="231" font-size="12" fill="currentColor" opacity="0.8">claude-sonnet — $1.00</text>
  <rect x="40" y="240" width="12" height="12" fill="#38bdf8" />
  <text x="58" y="251" font-size="12" fill="currentColor" opacity="0.8">gpt-4o — $0.47</text>
  <rect x="40" y="260" width="12" height="12" fill="#a78bfa" />
  <text x="58" y="271" font-size="12" fill="currentColor" opacity="0.8">gemini-pro — $0.18</text>
</svg>
```

## 3. Line chart — trend over time

**Use when:** fitness audit history, success rate per week,
cost-per-day burn-down.

```xml
<svg viewBox="0 0 560 240"
     style="max-width: 100%; height: auto; font-family: 'Inter', system-ui, sans-serif"
     role="img"
     aria-label="Fitness audit score by week: 88, 90, 92, 91, 93, 94, 95, 96">
  <title>Fitness Audit Score (8 weeks)</title>
  <desc>Week 1: 88. Week 8: 96. Target: ≥ 90. Source: audit logs.</desc>

  <!-- Grid -->
  <line x1="40" y1="40"  x2="540" y2="40"  stroke="currentColor" opacity="0.08" />
  <line x1="40" y1="80"  x2="540" y2="80"  stroke="currentColor" opacity="0.08" />
  <line x1="40" y1="120" x2="540" y2="120" stroke="currentColor" opacity="0.08" />
  <line x1="40" y1="160" x2="540" y2="160" stroke="currentColor" opacity="0.08" />

  <!-- Target line at y=80 (score 90) -->
  <line x1="40" y1="80" x2="540" y2="80" stroke="#22c55e" stroke-dasharray="4 4" stroke-width="1" />
  <text x="540" y="76" text-anchor="end" font-size="10" fill="#22c55e" opacity="0.8">target ≥ 90</text>

  <!-- Y-axis labels -->
  <text x="36" y="44"  text-anchor="end" font-size="10" fill="currentColor" opacity="0.45">100</text>
  <text x="36" y="84"  text-anchor="end" font-size="10" fill="currentColor" opacity="0.45">90</text>
  <text x="36" y="124" text-anchor="end" font-size="10" fill="currentColor" opacity="0.45">80</text>

  <!-- Polyline: data points 88, 90, 92, 91, 93, 94, 95, 96 -->
  <polyline points="60,128 130,108 200,88 270,98 340,78 410,68 480,58 540,48"
            fill="none" stroke="#f97316" stroke-width="2.5" stroke-linejoin="round" />

  <!-- Source -->
  <text x="280" y="232" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.35">
    Source: audit/fitness-*.json, weeks of 2026-03-08 through 2026-05-03 (ET)
  </text>
</svg>
```

## 4. Lollipop — ranked factors

**Use when:** ranking N items by a single dimension (success rate by
category, retry count by error code).

```xml
<svg viewBox="0 0 560 280"
     style="max-width: 100%; height: auto; font-family: 'Inter', system-ui, sans-serif"
     role="img"
     aria-label="Retry counts by error code, ranked.">
  <title>Retry Counts by Error Code (last 30 days)</title>
  <desc>RATE_LIMITED: 42. CONNECTION_ERROR: 28. TIMEOUT: 17. PARSE_ERROR: 9. Source: OutcomeStore.</desc>

  <!-- Rows: each is a horizontal line + circle. -->
  <line x1="200" y1="50"  x2="500" y2="50"  stroke="currentColor" opacity="0.15" />
  <line x1="200" y1="100" x2="500" y2="100" stroke="currentColor" opacity="0.15" />
  <line x1="200" y1="150" x2="500" y2="150" stroke="currentColor" opacity="0.15" />
  <line x1="200" y1="200" x2="500" y2="200" stroke="currentColor" opacity="0.15" />

  <!-- Lollipop sticks + circles (x = 200 + value*7) -->
  <line x1="200" y1="50"  x2="494" y2="50"  stroke="#f97316" stroke-width="2" />
  <circle cx="494" cy="50"  r="6" fill="#f97316" />
  <line x1="200" y1="100" x2="396" y2="100" stroke="#38bdf8" stroke-width="2" />
  <circle cx="396" cy="100" r="6" fill="#38bdf8" />
  <line x1="200" y1="150" x2="319" y2="150" stroke="#a78bfa" stroke-width="2" />
  <circle cx="319" cy="150" r="6" fill="#a78bfa" />
  <line x1="200" y1="200" x2="263" y2="200" stroke="#22c55e" stroke-width="2" />
  <circle cx="263" cy="200" r="6" fill="#22c55e" />

  <!-- Labels -->
  <text x="190" y="54"  text-anchor="end" font-size="12" fill="currentColor" opacity="0.8">RATE_LIMITED</text>
  <text x="190" y="104" text-anchor="end" font-size="12" fill="currentColor" opacity="0.8">CONNECTION_ERROR</text>
  <text x="190" y="154" text-anchor="end" font-size="12" fill="currentColor" opacity="0.8">TIMEOUT</text>
  <text x="190" y="204" text-anchor="end" font-size="12" fill="currentColor" opacity="0.8">PARSE_ERROR</text>

  <!-- Values -->
  <text x="510" y="54"  font-size="12" fill="currentColor" font-weight="800">42</text>
  <text x="412" y="104" font-size="12" fill="currentColor" font-weight="800">28</text>
  <text x="335" y="154" font-size="12" fill="currentColor" font-weight="800">17</text>
  <text x="279" y="204" font-size="12" fill="currentColor" font-weight="800">9</text>

  <text x="280" y="270" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.35">
    Source: OutcomeStore aggregate, last 30 days (2026-04-09 to 2026-05-09 ET)
  </text>
</svg>
```

## 5. Grouped bar — before/after comparison

**Use when:** comparing two states (before-fix vs after-fix, model A vs
model B across multiple categories).

Skeleton — adapt by adding pairs of bars per category. Use orange for
"before" / sky-blue for "after". Always a legend.

## 6. Area chart — distribution / range

**Use when:** showing latency p50/p95/p99 over time, or any band of
values.

Skeleton — use two `<polyline>` paths for upper/lower bounds + one
`<path>` filled with low-opacity color for the band, plus a solid
center line.

## 7. Radar — multi-dimensional scoring

**Use when:** comparing models across multiple quality dimensions
(reasoning / speed / cost / context-window).

Skeleton — use a polygon centered on `(280, 140)` with vertices at
each axis. Stack 2-3 polygons (one per model) with low fill-opacity to
show overlap.

## Anti-patterns

- **Hardcoded `fill="black"` on text** — breaks dark mode. Always use
  `fill="currentColor"`.
- **Setting `<svg>` background fill** — breaks dark mode. Leave the
  root SVG transparent.
- **Skipping `role="img"` + `aria-label`** — fails accessibility. The
  `aria-label` should include the headline number, not just "chart of
  data".
- **Embedding too much detail per chart** — if you need >7 categories,
  split into multiple charts or use a table.
- **Using `<title>` for the chart title visually** — `<title>` is for
  hover/tooltip. Render the visible title as `<text>`.
- **Picking the same color for adjacent bars** — use the four-color
  palette (orange / sky / purple / green) to differentiate.
