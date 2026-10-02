---
'nexus-agents': patch
---

PR reviews now require medium-or-higher findings to verify blockers and reviewer agreement. Security-role findings are treated as at least medium, and every request_changes vote still counts toward soft blocking regardless of its reported severity. Low/info findings from request_changes voters disclose verified and unverified counts separately in responses and review records. Missing or unknown severity in legacy findings defaults to medium.

Published finding severity types now include `info`. Consumers with exhaustive severity switches must handle this new member; the union expansion can break those switches at compile time.
