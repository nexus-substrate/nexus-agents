---
'nexus-agents': patch
---

The per-model weather lens (`getModelWeatherSummary`) moved from `mcp/tools/weather-report.ts` to a sibling `weather-report-model-lens.ts` with no change to the `weather_report` tool's schema, output, or the package's public API.
