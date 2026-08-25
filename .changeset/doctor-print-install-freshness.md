---
'nexus-agents': patch
---

actually print the global-install freshness verdict

The check computed its verdict, stored it on `DoctorResult`, and nothing
rendered it — `nexus-agents doctor` showed no line at all. A check whose output
never reaches the operator is the recorded-but-unread shape the check itself
exists to catch, one layer up.

Found by running the command against the freshly published build rather than by
reading the code: every test asserted the verdict object, and none asserted the
output.
