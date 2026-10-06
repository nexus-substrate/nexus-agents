---
'nexus-agents': major
---

Opt in to registered gateway endpoint routing with NEXUS_ROUTE_GATEWAY_ARMS. Preserve endpoint identity and shared breaker health, avoid family-slot duplicates, seed neutral learning priors, resolve the ranked default model (including supported overrides), and require a gateway cost declaration in both billing modes. Server bootstrap makes opted-in endpoint arms visible to the global routing registry as well as its private execution registry, including after rediscovery. Shared catalogue ownership keeps endpoint metadata until the last registry wrapper is disposed.

Keep raw `api:<endpoint>` identities in observer, feedback, and SQLite decision records, including alternatives. Preserve endpoint identity in Puppeteer agents and model-source catalogues so they do not collide with OpenCode. Restrict `routingArmDisplaySlot` to CLI and built-in API arms. Observer and stored decision types now admit endpoint arm IDs, so consumers that assumed CLI-only attribution must handle them. Budget admission and recommendations use the endpoint's resolved model capabilities and context window; endpoint latency remains unmeasured. Dry-run output reports that model and its gateway cost declaration, with missing pricing left unmeasured. Recommendations omit endpoint alternatives because decisions do not carry their resolved adapters.

Annotate unmeasured endpoint quality constraints and non-fail-closed category preferences in executed-stage records; endpoint-only candidate sets skip CLI quality measurement. Fail-closed category policies continue to exclude endpoints. Document these limits in configuration guidance.

Restore the prior timeout defaults: the global registry used by CLI subcommands and global-registry MCP handlers retains per-complexity timeouts, while the server's private execution registry retains its 30-minute default. Warn when a later global-registry claim supplies configuration that is ignored.

Return error Results for gateway completion and configuration validation when no chat default resolves or the default belongs to another endpoint. Memoize successful default resolution for the adapter's lifetime; failed resolution can retry after bootstrap registers the catalogue.
