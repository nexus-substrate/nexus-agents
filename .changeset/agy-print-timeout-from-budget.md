---
'nexus-agents': patch
---

The gemini seat (`agy`) now receives `--print-timeout` derived from the task's timeout budget (guard minus 5 s, never below 30 s) instead of agy's fixed 5-minute default. Before, a voter seat given a 600 s budget hit agy's own 5-minute wait first, agy exited 0 with an empty response, and the vote path reported a parse failure for the rest of the budget; the seat's full budget now reaches the CLI, and a task with no timeout keeps agy's default.
