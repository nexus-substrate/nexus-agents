---
'nexus-agents': patch
---

Codex subagent-limit awareness ([#2659](https://github.com/williamzujkowski/nexus-agents/issues/2659), Epic D).

Codex CLI's `~/.codex/config.toml` `[agents]` section defaults to `max_depth = 1` and `max_threads = 6` (the originating issue's `max_thread_depth` key name was wrong — corrected against the Codex config reference).

Per the #2659 design vote (Option C), nexus-agents now **warns** at fan-out time when a planned topology would exceed these — it does not write the operator's global config or silently auto-flatten routing. `collectRealVotes` emits a structured warning when more voter roles land on Codex than `max_threads` (the narrow single-CLI-fallback case; the existing round-robin + the `worker-dispatcher` cap-of-3 already keep the common paths within limits). New `src/cli-adapters/codex-limits.ts` exports the defaults + `checkCodexConcurrency` / `checkCodexDepth`; `.rules/subagent-coordination.md` documents the Codex limits.
