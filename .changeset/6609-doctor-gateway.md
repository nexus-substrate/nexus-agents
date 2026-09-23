---
'nexus-agents': minor
---

`nexus-agents doctor` now measures a configured OpenAI-compatible gateway (`NEXUS_OPENAI_COMPAT_URL`/`_KEY`) instead of trusting that its env vars are set, and its verdict counts the gateway.

- **A gateway-only host passes.** Before, doctor counted only `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GOOGLE_AI_API_KEY` as auth and required every CLI to be installed, so a host served entirely by a working gateway always exited 1. With a gateway whose `/models` call succeeds, a CLI that is not installed no longer fails the verdict (its slot is served by a gateway model of its family). An installed CLI still has to be authenticated and on a supported version.
- **A broken gateway fails, naming the host.** A gateway that is unreachable, rejects the key, lists no chat model, or is refused by the private-address guard exits 1, and the summary names it (`gateway <host>`). The "Voter transport: In-process gateway" line now reports that measurement (the host and chat-model count, or `FAILED` with the reason) rather than the presence of the env vars. Doctor makes one `GET /models` call when a gateway is configured and none when it is not.
- **New `doctor --gateway`** prints the gateway section: the model count before and after the chat filter (and `NEXUS_OPENAI_COMPAT_MODELS`, when set), a per-family census (anthropic, openai, google, unknown), the model each of the `claude`/`codex`/`gemini` slots resolves to (or `unavailable`), the private-address guard result, and the proxy in use (direct, the proxy host, exempted by `NO_PROXY`, or an ignored invalid proxy variable).
- **New `doctor --probe`** (implies `--gateway`) sends one short completion per family to the model its slot resolves to. It spends gateway tokens and is off unless passed; a failed probe fails the verdict.
- The key, `NEXUS_OPENAI_COMPAT_EXTRA_HEADERS` values and proxy credentials are never printed; error text from the gateway is redacted of the key and header values.
- **`list_available_models`** reports the gateway's discovered chat catalogue as a `gateway` transport in both plan and api billing mode. Before, plan mode did not list it, and api mode listed the `api:custom-openai` arm's catalogue under `opencode`.
