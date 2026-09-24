---
'nexus-agents': minor
---

`NEXUS_DISABLED_CLIS` now disables only a CLI's **transport**, not its slot ([#6720](https://github.com/nexus-substrate/nexus-agents/issues/6720)). This changes behaviour on hosts with an OpenAI-compatible gateway (`NEXUS_OPENAI_COMPAT_URL`).

Before this release, a disabled CLI took its whole family slot with it on a gateway host. `NEXUS_DISABLED_CLIS=claude` left the router with no `claude` arm, even when the gateway listed Anthropic models. A task pinned to `claude` fell through to another installed CLI, and `doctor --gateway` still reported the slot as served by the gateway.

A disabled CLI now counts as "CLI not available", the same as a CLI that is not installed:

- On a gateway host, the family's gateway model serves the slot. This covers the router arm, a pinned slot, the expert fallback chain and `delegate_to_model` scoring. If the gateway has no model of that family, the slot has no arm. A pinned call fails as "unavailable" and does not substitute another family.
- Without a gateway, nothing changes: the disabled CLI has no arm and gets no fallback slot or recommendation.
- The disabled binary is never spawned or probed, and `doctor` still skips it.
- Gateway voter panels were already dealt from the gateway catalogue, and still are. A disabled CLI's family is still seated there. The CLI voter path still excludes the disabled CLI.

`doctor --gateway` now prints one line per family slot, saying what serves it: `CLI`, the gateway model, or `unavailable`, with the reason. It uses the same decision the router makes. Plain `doctor` now also warns about a disabled CLI whose slot the gateway cannot serve, for example `claude slot unavailable: disabled by NEXUS_DISABLED_CLIS, and the gateway has no anthropic model`.

If you used `NEXUS_DISABLED_CLIS` on a gateway host to remove a family entirely, it no longer does that. Instead, set `NEXUS_OPENAI_COMPAT_MODELS` to an allowlist with no model of that family. The slot then has no arm, and voter panels do not seat that family.
