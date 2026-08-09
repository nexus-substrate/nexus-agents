---
'nexus-agents': minor
---

feat(cli-adapters): run the `gemini` arm on `agy` (Antigravity), replacing the retired gemini CLI (#4346)

Google retired the standalone `gemini` CLI for individual tiers. It now fails
**every** invocation with `IneligibleTierError: This client is no longer supported
for Gemini Code Assist for individuals`, exit code 55 — verified live against
`gemini` v0.51.0. The routing arm was dead, not degraded.

The `gemini` CliName is kept and its binary repointed to `agy` (verified against
v1.1.9). Decided by `consensus_vote` (`higher_order`, 7/0): adding or renaming a
CliName would touch ~30 exhaustive maps, two exhaustive switches, a duplicated
union in `packages/nexus-memory`, and persisted LinUCB/outcome history — to buy
routability of agy's Claude/GPT-OSS models, which are already reachable through
their own adapters.

**The load-bearing detail: `agy` exits 0 even when the run failed.** A bad model
returns `{"status":"ERROR","response":"","error":"…"}` with exit code 0. The new
`AgyResponseParser` is fail-closed by construction — unparseable output, truncated
JSON, a missing `status`, an unrecognized `status`, and a non-string `response` all
yield `null`, and `status` is pinned to the literal `SUCCESS` via Zod so a future
status cannot be waved through. Reintroducing exit-code-based classification here
would have undone #4350/#4354/#4362/#4363.

Other changes:

- Flag spellings updated (`-o json` → `--output-format json`, `-m` → `--model`,
  `--resume` → `--conversation`).
- `--policy <file>` has no agy equivalent, so the system prompt is prepended to
  the content — a deliberate downgrade in framing fidelity, which also removes the
  per-call tempdir the old path created.
- Token usage maps onto `TokenUsage` with `thinking_tokens` folded into
  `outputTokens` (generated, billable, and previously would have been dropped);
  `cache_read_tokens` deliberately not added, being a subset of input already
  counted.
- Model slugs live in a new `config/agy-model-map.ts` rather than in
  `cliModelName` — that field is also read by the API-based `GeminiAdapter`, which
  calls Google directly and needs real API ids. One field cannot serve both.
- `CLI_VERSION_REQUIREMENTS.gemini` now describes agy versions, so an installed
  gemini 0.5x correctly fails the minimum.
