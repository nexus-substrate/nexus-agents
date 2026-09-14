---
'nexus-agents': patch
---

`nexus-agents vote` without `--timeout` now waits the documented 300 seconds per seat instead of 90, read from `VOTE_TIMEOUTS.defaultMs` in both the parser and `vote --help` (#6236).
