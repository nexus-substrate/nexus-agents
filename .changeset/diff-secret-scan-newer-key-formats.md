---
'nexus-agents': patch
---

security(capability-loop): the pre-push diff-secret-scan now catches newer OpenAI key prefixes (`sk-proj-`/`sk-svcacct-`/`sk-admin-`, whose hyphen broke the classic `sk-[A-Za-z0-9]{32,}` class) and base64 credential values with `=` padding (the generic-credential value class omitted `=`). This scanner is the fail-closed pre-push gate that must be solid before Option A (#3670) pushes attacker-influenceable diffs. (#3752)
