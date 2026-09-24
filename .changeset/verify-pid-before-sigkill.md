---
'nexus-agents': patch
---

A CLI timeout or cancel no longer risks SIGKILLing an unrelated process that reused a PID from the CLI's tree (#6714). Once the CLI has exited, the SIGKILL escalation stops re-walking its old PID, which the kernel may already have handed to another process. On Linux each descendant is recorded with its `/proc/<pid>/stat` start time and re-checked before every signal and liveness check, so a PID that now names a different process is skipped and no longer keeps the escalation armed. Other platforms have no cheap start time, so there descendants are still signalled by PID alone. A server shutdown that falls inside the 5-second SIGKILL grace window now also reaches a grandchild that ignored the SIGTERM: on Linux the tree stays tracked after the CLI closes until those descendants are gone. Elsewhere a reused PID cannot be told apart, so the tree is still forgotten when the CLI closes.
