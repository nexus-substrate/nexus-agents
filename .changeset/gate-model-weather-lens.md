---
'nexus-agents': patch
---

Gate the per-model weather telemetry lens behind an opt-in (`includeModelWeather`), default off (#4202). The routing-bonus path no longer pays the per-model full-store scans introduced in #4194; the `weather_report` MCP tool always opts in, so its response is unchanged.
