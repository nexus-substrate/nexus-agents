---
'nexus-agents': patch
---

Stopping a CLI subprocess on macOS and other non-Linux POSIX systems no longer blocks the event loop (#6718). A cancel, a timeout, the SIGKILL escalation and the graceful-shutdown pass used to run a synchronous `ps` (up to 2 s) to find the CLI's descendants before signalling them. They now run it asynchronously, and still collect the descendants before any signal is sent. The one synchronous `ps` left is the process `exit` hook's, because an `exit` handler cannot wait. Linux is unchanged: it reads `/proc` directly and spawns nothing.

Known limitation: a process that a CLI double-forked, and that was reparented to init before the signal, is not in the CLI's process tree. It is neither signalled nor escalated. Such a daemon may be meant to outlive the CLI, and no small, dependency-free way to reach it exists (Node exposes no `PR_SET_CHILD_SUBREAPER`, and the CLIs share the server's process group), so the gap is documented in the module rather than closed.
