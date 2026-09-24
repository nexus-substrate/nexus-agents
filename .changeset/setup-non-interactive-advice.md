---
'nexus-agents': patch
---

`nexus-agents setup` no longer tells you to set `CI=true` when it refuses to run without a TTY. Setting `CI=true` is itself one of the conditions that triggers the refusal, so following that advice printed the same error again. The message now names the one remedy that works: re-run with `--non-interactive`.
