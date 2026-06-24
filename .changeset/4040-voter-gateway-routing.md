---
'nexus-agents': minor
---

Route consensus voters through the in-process gateway adapter ([#4040](https://github.com/nexus-substrate/nexus-agents/issues/4040))

`consensus_vote` and `pr_review` were the only model-using tools not wired to the in-process
OpenAI-compatible gateway adapter that every other tool already receives. They fell back to
the CLI adapter path, shelling out to a coding CLI (e.g. `opencode run`) — which is the sole
reason voting alone required a separate CLI auth and the model key forwarded across the
subprocess boundary (the root of the `NEXUS_SUBPROCESS_ENV_ALLOWLIST=0` workaround and the
nested-spawn class, #4033).

When an OpenAI-compatible gateway is configured (`NEXUS_OPENAI_COMPAT_*`), the voter panel now
runs **in-process** over the gateway's models — no CLI subprocess, no cross-process key
forwarding. Per-role model diversity is preserved: the gateway already discovers one adapter
per served model, and voter roles are round-robined across them (wrapping when the gateway
serves fewer models than roles). The bootstrap previously discarded all but the first
discovered gateway model; it now keeps the full set and threads it to the voter tools. With no
gateway configured, behavior is unchanged (the CLI round-robin path).
