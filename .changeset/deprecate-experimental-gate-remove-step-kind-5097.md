---
'nexus-agents': patch
---

`PluginRegistryOptions.experimentalEnabled` and `experimentalAllow` are deprecated (#5097). No production construction sets them — `registerCorePlugins` / `createCorePluginRegistry` build the registry with no options, every core manifest is `experimental: false`, and the registry is frozen right after core registration — so the experimental gate could never open and only core plugins ever load. Both fields stay accepted and still deny exactly as before; removal is tracked in #5097 for the next major. `docs/v2/05-plugin-system-spec.md` now says the experimental config is a design target, not shipped behaviour.

`StepEvent.kind` (and the `StepKind` union, `StepOptions.kind`) is removed. The module header claimed the field routed/coloured operator output, but neither the console renderer nor the logger bridge read it, and three of its seven values (`workflow.node`, `cli.call`) had no producer. None of these types was on the published API surface; the `withStep` callers in `graph-hooks`, `execute-expert`, `dev-pipeline`, `consensus-plan` and `triangulated-review` simply stop passing it. Emitted `step.*` events lose the `kind` key; every other field is unchanged.
